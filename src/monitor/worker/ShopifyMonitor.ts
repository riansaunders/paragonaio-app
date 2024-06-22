import { isProd } from "@core/config";
import { StepHandlerParams } from "@core/job/StepHandlerParams";
import { TaskStep } from "@core/job/TaskStep";
import { getProducts } from "@core/shopify/shopify.service";
import { MessageType } from "@entities/MessageType";
import { MonitorTask } from "@entities/MonitorTask";
import { ProductVariant } from "@entities/Product";
import cheerio from "cheerio";
import { roundToNearestMinutes } from "date-fns";
import qs from "qs";
import { ShopifyProduct } from "../../core/shopify/entities/ShopifyProduct";
import { ShopifyProductVariant } from "../../core/shopify/entities/ShopifyProductVariant";
import { MonitorWorker } from "./MonitorWorker";
import { LoadingStock } from "./task-status";

export class ShopifyMonitor extends MonitorWorker {
  productHandle?: string;
  sizeOptionPosition?: number;
  constructor(task: MonitorTask) {
    super(task);
    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        const code = error.request?.res?.statusCode;

        if (code === 429) {
          this.rotateProxy();
        }
        if (code === 404) {
          this.updateStatus("Sold Out | Unavailable", MessageType.Warning);
        }
        return Promise.reject(error);
      }
    );

    this.addStep(TaskStep.DebugA, (params) => {
      this.updateStatus("Starting");
      return params.next();
    });

    if (this.task.group.storePassword) {
      this.addStep(TaskStep.LoadSite, (params) => {
        return this.step_goToSite(params);
      });
    }

    this.addStep(TaskStep.NavigateToProductDetails, (params) =>
      this.loadProductStockDetails(params)
    );
  }

  async step_goToSite({ next, retry }: StepHandlerParams) {
    const { storePassword } = this.task.group;

    if (!storePassword) {
      return next();
    }

    return await this.navigateTo("/password").then(async (page) => {
      const url = page.url;
      const passForm = page.document("[action='/password']");
      page.setDocValueAll("password", storePassword);

      return await this.post(
        passForm.attr("action") || "/password",
        passForm.serialize(),
        {
          maxRedirects: 0,
        }
      )
        .then(() => retry(this.task.delay))
        .catch((e) => {
          const nextLocation = String(e.response?.headers["location"]);

          if (!nextLocation.includes("/password")) {
            this.updateStatus(
              `[Password] ${this.requestURL.concat(url)} loaded`
            );

            return next();
          }
          this.updateStatus(`Check Store Password`, MessageType.Warning);
          return retry(this.task.delay);
        });
    });
  }

  setSizePosition(sp: any) {
    if (!sp) {
      return;
    }

    const which = sp.options_with_values ?? sp.options;
    const sizeOption = which?.find(
      (op: any) => /size/i.test(op.name) || /size/i.test(op)
    );

    this.sizeOptionPosition =
      typeof sizeOption === "object"
        ? sizeOption.position
        : typeof sizeOption === "string"
        ? which.indexOf(sizeOption)
        : undefined;
  }

  getVariantSize(v: ShopifyProductVariant) {
    const aa = v as any;

    if (this.sizeOptionPosition === 0 && aa.options) {
      return aa.options[0];
    }
    if (this.sizeOptionPosition === 1 && aa.options?.length > 1) {
      return aa.options[1];
    }

    if (this.sizeOptionPosition === 1 && v.option1) {
      return v.option1;
    } else if (this.sizeOptionPosition === 2 && v.option2) {
      return v.option2;
    } else if (this.sizeOptionPosition === 3 && v.option3) {
      return v.option3;
    }

    if (aa?.options && this.sizeOptionPosition) {
      return aa.options[this.sizeOptionPosition];
    }
    return v.title;
  }

  async loadProductStockDetails(params: StepHandlerParams): Promise<TaskStep> {
    const { retry } = params;
    let { monitor, delay } = this.task;
    this.updateStatus(LoadingStock);

    const isNumber = !isNaN(Number(monitor));
    if (isNumber) {
      return this.loadProductFromVariant(params);
    }

    const funkoShopDetails = "/shop/details/";

    if (monitor.includes(funkoShopDetails)) {
      monitor = this.requestURL
        .concat("/products/")
        .concat(
          monitor.substr(
            monitor.indexOf(funkoShopDetails) + funkoShopDetails.length
          )
        );
    }

    const handleRegex = /\b.*?\/products\/\b([^?\/]*)/i;
    //keywords
    if (!handleRegex.test(monitor)) {
      const products = await getProducts(this, this.requestURL);
      if (!products || !products.products) {
        this.updateStatus("Probably not Shopify", MessageType.Error);
        return retry(this.task.delay);
      }
      const myMonitorIgnored = new RegExp(this.task.monitor, "i");

      let prod: ShopifyProduct | undefined;
      for (let p of products.products) {
        const product = p as ShopifyProduct;
        if (
          this.textMatchesMonitor(product.title) ||
          myMonitorIgnored.test(product.handle)
        ) {
          prod = product;
          break;
        }
      }
      let anyAvailable = false;

      this.setSizePosition(prod);
      const variants = prod?.variants.map((v) => {
        if (v.available) {
          anyAvailable = true;
        }

        return {
          id: String(v.id),
          title: v.title,

          size: this.getVariantSize(v),
          inStock: v.available,
        };
      });
      if (prod && anyAvailable && variants) {
        this.productStockUpdate({
          id: String(prod.id),
          title: prod.title,
          monitor: this.task.monitor,

          url: this.requestURL + `/products/${prod.handle}`,
          productForm: {},

          price: prod.variants[0]?.price,
          imageURL: prod.images[0]?.src,
          variants: variants,
        });
      } else {
        this.updateStatus("Sold Out | Unavailable", MessageType.Warning);
      }
      return retry(delay);
    }

    // monitor is for sure a link then.

    await this.navigateTo(monitor)
      .then(async (page) => {
        const { document } = page;

        // let availableOptionsNode = document("select[name='id'] > option");
        let availableOptionsNode = document("#FormProductSelect > option");

        if (!availableOptionsNode.length) {
          availableOptionsNode = document("select[name='id'] > option");
          // console.log("Using method 2");
        }

        if (!availableOptionsNode.length) {
          availableOptionsNode = document("input[name='_id']");
          // console.log("Using method 3");
        }

        if (!availableOptionsNode.length) {
          availableOptionsNode = document(
            "form[action^='/cart/add'] > input[name='id']"
          );
          console.log("Using method 4");
        }

        if (!availableOptionsNode.length) {
          page.document("noscript").each((_, c) => {
            if (availableOptionsNode.length) {
              return;
            }
            const el = cheerio(c);
            if (
              el.html()?.includes(`name="id"`) &&
              el.html()?.includes("<option")
            ) {
              const node = cheerio(el.html());
              availableOptionsNode = node.children("option");
            }
          });
        }

        let variants: ProductVariant[] = [];
        let form = page.document("[action='/cart/add']").serializeArray();
        let sp: any;

        let dataJson =
          page.document("[data-product-json]").html() ||
          page.document("#ProductJson-product-template").html() ||
          page.document(".product-json").html() ||
          page.document("[js-product-json]").html() ||
          page.document("#ProductJson--product-template").html() ||
          page.document("#ProductJson-bbc-product-template").html();

        if (!dataJson) {
          try {
            const regex = /(product: (.*))/gm;
            let x = page.document("script:contains('product: ')").html();

            if (x && regex.test(x)) {
              const match = x.match(regex);

              if (match?.length) {
                dataJson = `{${match[0].substr(
                  0,
                  match[0].length - 1
                )}}`.replace("product", '"product"');
              }
            }
          } catch (e) {
            // console.error(e);
          }
        }

        if (dataJson) {
          try {
            sp = JSON.parse(dataJson);
            if (sp.product) {
              sp = sp.product;
            }

            this.setSizePosition(sp);

            // console.log("Size position", this.sizeOptionPosition);
          } catch (e) {
            // console.log(dataJson);
            // console.error(e);
          }
        }

        let anyStock: boolean = false;

        // the page is weirdly formatted, but the product json is there so use it
        if (!availableOptionsNode.length && !sp?.variants) {
          const ids = document("input[name='id']");

          if (ids.length) {
            ids.each((_, e) => {
              const el = cheerio(e);
              const variantID = el.attr("value");

              const pV =
                el.parent("label").text() ||
                el.parent("label").attr("data-value");

              const oos = el.attr("disabled");

              if (!oos) {
                anyStock = true;
              }

              if (pV && variantID) {
                variants.push({
                  id: variantID,
                  size: pV?.trim(),
                  inStock: !oos,
                });
              }
            });
          }
        } else if (sp?.variants) {
          console.log("HAS VARIANTS");
          for (let variant of sp.variants) {
            if (variant.available) {
              anyStock = true;
            }
            variants.push({
              id: String(variant.id),

              size: this.getVariantSize(variant).trim(),
              inStock: variant.available,
            });
          }
        } else if (availableOptionsNode.length) {
          availableOptionsNode.each((_, e) => {
            const el = cheerio(e);
            const oos = el.attr("disabled");

            const variantID = el.attr("value");

            const sizeOrTitle = el.text().trim();

            if (!oos) {
              anyStock = true;
            }

            const v = sp?.variants
              ? sp.variants?.find((v: any) => String(v.id) === variantID)
              : undefined;

            variants.push({
              id: String(variantID!),

              size: v ? this.getVariantSize(v).trim() : sizeOrTitle,
              inStock: !oos,
            });
          });
        }
        if (anyStock) {
          const title = page
            .document("meta[property='og:title']")
            .attr("content");

          // Let's make sure that the page loaded properly.
          if (title) {
            const price = page
              .document("meta[property='og:price:amount']")
              .attr("content");
            const img = page
              .document("meta[property='og:image']")
              .attr("content");

            const ab = {
              ...this.formToObject(form),
            };

            this.productStockUpdate({
              id: monitor,
              title: title!,
              monitor: this.task.monitor,

              url: monitor.split("?")[0],
              productForm: ab,
              price: price,
              imageURL: img,
              variants: variants,
            });
          }
        } else {
          //  https://shop.telfar.net/collections/upcoming-drop/products/medium-dark-olive-shopping-bag?variant=32204951847011

          this.updateStatus("Sold Out | Unavailable", MessageType.Warning);
        }

        if (!isProd) {
          const title = page
            .document("meta[property='og:title']")
            .attr("content");

          const price = page
            .document("meta[property='og:price:amount']")
            .attr("content");
          const img = page
            .document("meta[property='og:image']")
            .attr("content");

          console.log({
            id: monitor,
            title: title!,
            monitor: this.task.monitor,

            url: monitor.split("?")[0],

            price: price,
            imageURL: img,
            variants: variants,
          });
        }
      })
      .catch((e) => {
        const code = e.request?.res?.statusCode;
        if (code === 404) {
          this.updateStatus("Sold Out | Unavailable", MessageType.Warning);
        }
      });
    return retry(delay);
  }

  formToObject(object: { name: string; value: string }[]) {
    const out: any = {};
    for (let o of object) {
      out[o.name] = o.value;
    }
    return out;
  }

  async loadProductFromVariant({
    retry,
  }: StepHandlerParams): Promise<TaskStep> {
    this.updateStatus(LoadingStock);
    return await this.post(
      "/cart/add.js",
      qs.stringify({
        id: Number(this.task.monitor),
        quantity: 1,
      }),
      {
        withCredentials: false,
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    )
      .then((r) => r.data)
      .then(async (p) => {
        if (!p) {
          this.updateStatus(
            "Variant ID may not have been found",
            MessageType.Warning
          );
          return retry(this.task.delay);
        }

        this.productStockUpdate({
          id: this.task.monitor,
          title: p.title,
          monitor: this.task.monitor,

          url: this.requestURL + `/products/${p.handle}`,
          productForm: {
            id: this.task.monitor,
          },
          price: !isNaN(p.price) ? p.price / 100 : p.price,
          imageURL: p.feature_image?.url || p.image,
          variants: [
            {
              id: this.task.monitor,

              size:
                p.options_with_values.find((x: any) => /size/i.test(x.name))
                  ?.value || "?",
              inStock: true,
            },
          ],
        });
        this.productHandle = p.handle;

        return retry(this.task.delay);
      })
      .catch(async (err) => {
        if (!err.response) {
          return retry(this.task.delay);
        }
        const { data } = err.response;
        const status = data?.status;
        const description = data?.description as string | undefined;

        if (status === 429 || status === 503) {
          this.updateStatus(
            String(data || "No data for this error."),
            MessageType.Error
          );
        }

        if (status === 429) {
          this.updateStatus("Too many requests");
          return retry(this.task.delay);
        }
        if (description && /\bsold out\b/i.test(description)) {
          this.updateStatus("Sold Out | Unavailable", MessageType.Warning);
          return retry(this.task.delay);
        }
        if (status === 404) {
          this.updateStatus("Variant not found", MessageType.Warning);
        }
        return retry(this.task.delay);
      });
  }

  modifyDelay(delay: number): number {
    const now = new Date();

    const millisecondsToNextMinute = roundToNearestMinutes(now);

    const differenceBetweenNextMinuteAndNow = Math.abs(
      millisecondsToNextMinute.getTime() - now.getTime()
    );

    if (differenceBetweenNextMinuteAndNow < delay) {
      return Math.max(differenceBetweenNextMinuteAndNow, 0);
    } else {
      return delay;
    }
  }
}
