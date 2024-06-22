import { FootsiteProduct } from "@core/footsites/entities/FootsiteProduct";
import { FootsiteProductVariant } from "@core/footsites/entities/FootsiteProductVariant";
import { FootsiteSession } from "@core/footsites/entities/FootsiteSession";
import { StepHandlerParams } from "@core/job/StepHandlerParams";
import { TaskStep } from "@core/job/TaskStep";
import { TaskPage } from "@core/task-page";
import { MessageType } from "@entities/MessageType";
import { MonitorTask } from "@entities/MonitorTask";
import { Product, ProductVariant } from "@entities/Product";
import { QueueFinish } from "@queueit/QueueFinish";
import UserAgent from "user-agents";
import { v4 as uuidv4 } from "uuid";
import { MonitorWorker } from "./MonitorWorker";
import { Found, LoadingStock, WaitingInQueue } from "./task-status";
// https://www.champssports.com/zgw/product-core/v1/pdp/CS/sku/166800C
const siteConfig = [
  {
    name: "FL",
    url: "https://www.footlocker.com",
  },
  {
    name: "FA",
    url: "https://www.footaction.com",
  },

  {
    name: "CS",
    url: "https://www.champssports.com",
  },
  {
    name: "EB",

    url: "https://www.eastbay.com",
  },
  {
    name: "KFL",

    url: "https://www.kidsfootlocker.com",
  },
  {
    name: "FLCA",

    url: "https://www.footlocker.ca",
  },
];

type ZGWProduct = {
  model: {
    name: string;
  };
  style: {
    color: string;
  };
  sizes: [
    {
      productWebKey: number;
      productNumber: number;
      active: boolean;
      size: string;
      strippedSize: string;
      inventory: {
        inventoryAvailable: boolean;
      };
      price: {
        salePrice: number;
      };
    }
  ];
};
export class FTLMonitor extends MonitorWorker {
  session?: FootsiteSession;
  product?: FootsiteProduct;
  previousProduct?: Product;
  uuid: string;
  triedIDs: string[] = [];
  isNA: boolean;

  constructor(task: MonitorTask) {
    super(task);
    this.ignoreServerErrors = false;

    this.uuid = uuidv4();

    this.http.defaults.headers["Accept"] = "application/json";

    this.http.defaults.headers["accept-encoding"] = "gzip, deflate, br";
    this.isNA =
      this.requestURL.endsWith(".com") || this.requestURL.endsWith(".ca");
    const ua = new UserAgent();

    this.http.defaults.timeout = 11000;
    this.http.interceptors.request.use(
      (request) => {
        const sessionCookie = this.jar
          .getCookiesSync(this.requestURL)
          .find((c) => c.key === "JSESSIONID");
        request.headers["x-fl-request-id"] = uuidv4();
        // request.headers["x-fl-request-id"] = this.uuid;
        if (sessionCookie) {
          request.headers["x-flapi-session-id"] = sessionCookie?.value;
        }
        if (
          request.method === "post" ||
          request.method === "POST" ||
          request.method === "put" ||
          request.method === "PUT"
        ) {
          request.headers["Content-Type"] = "application/json";
          request.headers["x-csrf-token"] = this.session?.csrfToken;
        }

        request.headers["cache-control"] = "no-cache";
        request.headers["dnt"] = 1;
        request.headers["pragma"] = "no-cache";
        return request;
      },
      (error) => Promise.reject(error)
    );

    this.setUserAgent(ua.toString());

    this.addStep(TaskStep.NavigateToProductPage, async (params) => {
      this.updateStatus("Checking Queue-It");
      return await this.get(
        this.requestURL.concat(`/product/~/${this.task.monitor}.html`),
        {
          maxRedirects: 0,
        }
      )
        .then((r) => {
          return params.next();
        })
        .catch(async (e) => {
          const location: string | undefined = e.response?.headers["location"];
          if (location?.includes("queue-it.net")) {
            if (location.includes("/afterevent.aspx")) {
              // the event is over, so let's go anyway?
              return params.next();
            }
            this.updateStatus("Queue-It In Progress", MessageType.Warning);

            const goToRedirectUrl = async (
              fulfilled: QueueFinish
            ): Promise<boolean> => {
              return await this.get(fulfilled.redirectUrl)
                .then(() => true)
                .catch(async (e) => {
                  const responseCode = e.request?.res?.statusCode;

                  if (responseCode === 404) {
                    console.log(`${fulfilled.redirectUrl} pulled, whatever.`);
                    return false;
                  }
                  if (responseCode === 403) {
                    console.log(`${fulfilled.redirectUrl} blocked me.`);
                    return false;
                  }
                  if (responseCode === 429) {
                    await this.rotateProxy();
                  }

                  return new Promise(async (resolve) => {
                    if (!this.isShutdown) {
                      const delay = await this.modifyDelay(this.task.delay);
                      setTimeout(async () => {
                        resolve(await goToRedirectUrl(fulfilled));
                      }, delay);
                    } else {
                      resolve(false);
                    }
                  });
                });
            };

            const user = await this.requestQueueitUser(this.requestURL);

            if (user) {
              return params.retry(0);
            }

            const html: string | undefined = await this.get(location, {
              timeout: 5000,
            })
              .then((r) => r.data)
              .catch((e) => undefined);

            if (!html || html.toLowerCase().includes("back off")) {
              console.log("Getting the queue-it page gave an error");
              console.log(`Queue-It Page: ${location}`);
              await this.rotateProxy();
              return params.retry(0);
            }

            const page = new TaskPage(location, html);

            const fulfilled = await this.requestQueueFinish({
              triggerUrl: this.requestURL,
              page: page,
            });
            if (fulfilled && !fulfilled.blocked) {
              await goToRedirectUrl(fulfilled);
            }
          }

          await this.handleApiError(e);
          return params.retry(this.task.delay);
        });
    });

    this.addStep(TaskStep.QueueItComplete, (params) => {
      this.sendQueueUser(this.requestURL);

      return params.next();
    });
    this.addStep(TaskStep.BeginProductSearch, (params) =>
      this.checkForStockUsingAPI(params)
    );
  }

  async checkForStockUsingAPI({ retry }: StepHandlerParams): Promise<TaskStep> {
    this.updateStatus(LoadingStock);
    const banner = siteConfig.find((c) => c.url === this.requestURL);

    if (banner?.name === "FLCA" || !banner) {
      return await this.loadProductAndUpdateDetails().then(() =>
        retry(this.task.delay)
      );
    }
    return await this.get(
      `/zgw/product-core/v1/pdp/${banner.name}/sku/${this.task.monitor}`
    )
      .then((r) => {
        this.updateStatus(Found);
        const p: ZGWProduct = r.data;

        const img = `https://images.footlocker.com/pi/${this.task.monitor}/zoom/${this.task.monitor}.jpeg`;

        let anyAvail = false;
        const variants = p.sizes.map((s) => {
          if (s.inventory.inventoryAvailable) {
            anyAvail = true;
          }

          return <ProductVariant>{
            id: String(s.productWebKey),
            color: p.style.color,
            size: s.size,
            inStock: s.inventory.inventoryAvailable,
          };
        });

        if (anyAvail) {
          this.productStockUpdate(
            (this.previousProduct = {
              title: p.model.name,

              id: this.task.monitor,
              monitor: this.task.monitor,
              price: String(p.sizes[0]?.price.salePrice),
              url: this.requestURL + `/product/~/${this.task.monitor}.html`,
              imageURL: img,
              variants: variants,
            })
          );
        } else {
          this.updateStatus("Sold Out | Unavailable", MessageType.Warning);
        }

        return retry(this.task.delay);
      })
      .catch(async (e) => {
        const responseCode = e.request?.res?.statusCode;
        if (responseCode === 404 || responseCode === 400) {
          this.updateStatus(
            "Product may have moved or been pulled",
            MessageType.Warning
          );
        } else {
          await this.handleApiError(e);
          throw e;
        }
        return retry(this.task.delay);
      });
  }

  async getSession({ next, retry }: StepHandlerParams): Promise<TaskStep> {
    this.updateStatus("Getting Session");
    return this.get(`/api/v3/session?timestamp=${this.timestamp()}`)

      .then((r) => {
        this.session = r.data.data;
        return next();
      })
      .catch(async (e) => {
        await this.handleApiError(e);

        return retry(this.task.delay);
      });
  }

  async removeFromCart(index: number): Promise<void> {
    this.updateStatus("Refreshing Cart");
    return await this.delete(
      `/api/users/carts/current/entries/${index}?timestamp=${this.timestamp()}`
    )
      .then(() => {})
      .catch(async (e) => {
        const code = e.request?.res?.statusCode;
        if (code !== 400) {
          await this.handleApiError(e);
        } else {
          throw e;
        }
      });
  }

  async checkForVariant(
    variant: FootsiteProductVariant
  ): Promise<FootsiteProductVariant> {
    //
    return await this.post(
      `/api/users/carts/current/entries?timestamp=${this.timestamp()}`,
      {
        productQuantity: 1,
        productId: variant.code,
      },
      {
        headers: {
          referer: `${this.requestURL}/product/~/${this.task.monitor!}.html`,
          origin: this.requestURL,
          "x-fl-productid": variant.code,
          "accept-language": "en-US,en;q=0.9",
        },
      }
    )
      .then(() => variant)
      .catch(async (e) => {
        const responseCode = e.request?.res?.statusCode;
        // 531 is out of stock
        if (responseCode !== 531) {
          await this.handleApiError(e);
        }
        throw e;
      });
  }

  async checkForStockUsingATC({ retry }: StepHandlerParams): Promise<TaskStep> {
    this.updateStatus(LoadingStock);
    let size: string | undefined;
    let code: string;
    let color: string | undefined;
    const untriedSize = this.product?.sellableUnits.find((v) => {
      size = v.attributes.find((a) => a.type === "size")?.value;
      if (!size) {
        return;
      }
      if (!isNaN(Number(size))) {
        size = String(Number(size));
      }
      if (
        !this.triedIDs.includes(v.code) &&
        this.sizeMatchesMine(size) &&
        v.stockLevelStatus === "inStock"
      ) {
        color = v.attributes.find((v) => v.type === "style")?.value;
        code = v.code;
        return v;
      }
    });
    if (!untriedSize || !size) {
      this.triedIDs = [];
      await this.loadProductAndUpdateDetails().catch((e) => {
        console.log(e);
      });
      return retry(this.task.delay);
    }

    return await this.post(
      `/api/users/carts/current/entries?timestamp=${this.timestamp()}`,
      {
        productQuantity: 1,
        productId: untriedSize.code,
      },
      {
        headers: {
          referer: `${this.requestURL}/product/~/${this.task.monitor!}.html`,
          origin: this.requestURL,
          "x-fl-productid": untriedSize.code,
          "accept-language": "en-US,en;q=0.9",
        },
      }
    )
      .then(() => {
        this.updateStatus(Found, MessageType.Good);

        this.triedIDs.push(code!);
        const theimg = this.product!.images[0];
        const p = this.product!;

        const variants = this.previousProduct
          ? this.previousProduct.variants
          : this.product?.sellableUnits
              ?.filter((is) => {
                const p = this.product!;
                const styleAttribute = is.attributes.find(
                  (a) => a.type === "style"
                );
                const va = p.variantAttributes.find(
                  (va) => va.code === styleAttribute?.id || va.code === is.code
                );
                if (va?.sku === this.task.monitor) {
                  return true;
                } else {
                  return false;
                }
              })
              .map((v) => {
                size = v?.attributes.find((a) => a.type === "size")?.value;
                if (!size) {
                  return;
                }
                const styleAttribute = v.attributes.find(
                  (a) => a.type === "style"
                );
                const pimg = this.product!.images.find(
                  (i) => i.code === styleAttribute?.id
                );
                const ns = Number(size);
                return {
                  id: v.code,
                  color: styleAttribute?.value,
                  imageURL: this.isNA
                    ? pimg?.variations?.find((v: any) => v.format === "zoom")
                        ?.url
                    : `https://images.footlocker.com/is/image/FLEU/`.concat(
                        this.task.monitor
                      ),
                  size: isNaN(ns) ? size : String(ns),
                  inStock: v.stockLevelStatus === "inStock",
                };
              });
        const xyz = {
          title: this.product!.name,
          id: this.task.monitor,
          monitor: this.task.monitor,
          url: this.requestURL + `/product/~/${this.task.monitor}.html`,
          price: String(untriedSize.price.value),
          imageURL: this.isNA
            ? theimg?.variations?.find((v: any) => v.format === "zoom")?.url
            : `https://images.footlocker.com/is/image/FLEU/`.concat(
                this.task.monitor
              ) || undefined,
          variants: variants,
        } as Product;
        xyz.variants?.forEach((t) => {
          if (t.id === untriedSize.code) {
            t.inStock = true;
          }
        });
        this.productStockUpdate(xyz);
        this.previousProduct = xyz;

        return retry(this.task.delay);
      })
      .catch(async (e) => {
        const responseCode = e.request?.res?.statusCode;
        if (responseCode === 531) {
          this.previousProduct?.variants.forEach((v) => {
            if (v.id === untriedSize.code) {
              v.inStock = false;
              ``;
            }
          });
          this.updateStatus(`Size ${size} OOS`, MessageType.Warning);
          if (this.previousProduct) {
            this.productStockUpdate(this.previousProduct);
          }
          this.triedIDs.push(untriedSize.code!);
        } else {
          await this.handleApiError(e);
        }
        return retry(this.task.delay);
      });
  }

  async loadProductAndUpdateDetails() {
    return await this.get(`/api/products/pdp/${this.task.monitor}`)
      .then((d) => {
        this.product = d.data;
        const p = this.product!;
        if (p.sellableUnits) {
          this.updateStatus(Found);
        }

        const variants = p.sellableUnits
          ?.filter((is) => {
            const styleAttribute = is.attributes.find(
              (a) => a.type === "style"
            );
            const va = p.variantAttributes.find(
              (va) => va.code === styleAttribute?.id || va.code === is.code
            );
            if (va?.sku === this.task.monitor) {
              return true;
            } else {
              return false;
            }
          })
          .map((is) => {
            const size = is.attributes.find((a) => a.type === "size")?.value;
            const styleAttribute = is.attributes.find(
              (a) => a.type === "style"
            );
            const pimg = p.images.find((i) => i.code === styleAttribute?.id);

            return {
              id: is.code,
              size: String(size),
              color: styleAttribute?.value,
              imageURL: this.isNA
                ? pimg?.variations?.find((v: any) => v.format === "zoom")?.url
                : `https://images.footlocker.com/is/image/FLEU/`.concat(
                    this.task.monitor
                  ),
              inStock: is.stockLevelStatus === "inStock",
            };
          });

        this.productStockUpdate(
          (this.previousProduct = {
            title: p.name,

            id: this.task.monitor,
            monitor: this.task.monitor,
            price: String(p.sellableUnits[0]?.price?.value || ""),
            url: this.requestURL + `/product/~/${this.task.monitor}.html`,
            imageURL: this.isNA
              ? p.images[0]?.variations.find((v) => v.format === "zoom")?.url
              : `https://images.footlocker.com/is/image/FLEU/`.concat(
                  this.task.monitor
                ) || "",
            variants: variants,
          })
        );
      })
      .catch(async (e) => {
        const responseCode = e.request?.res?.statusCode;
        if (responseCode === 404 || responseCode === 400) {
          this.updateStatus(
            "Product may have moved or been pulled",
            MessageType.Warning
          );
          // console.log(e.response?.data);
        } else {
          await this.handleApiError(e);
          throw e;
        }
      });
  }

  async handleApiError(axiosResponse: any): Promise<any> {
    const responseCode = axiosResponse.request?.res?.statusCode;

    // throttled, waiting room, queued
    if (responseCode === 529 || responseCode === 503 || responseCode === 302) {
      this.updateStatus(WaitingInQueue, MessageType.Warning);
    } else if (responseCode === 429) {
      // nothing for 429.
    } else if (responseCode === 403) {
      const data = axiosResponse?.data;

      const captchaURL = data?.url;
      if (captchaURL) {
        this.rotateProxy();

        this.updateStatus("Monitor has been flagged by DataDome");
      }
    } else {
      const response = axiosResponse.response;

      if (responseCode) {
        this.updateStatus(`Unknown Code ${responseCode}`, MessageType.Warning);
        console.log("Unknown code", responseCode);
        console.log(response?.data);
      } else {
        console.log(axiosResponse);
      }
    }
  }

  timestamp() {
    return new Date().getTime();
  }
}
