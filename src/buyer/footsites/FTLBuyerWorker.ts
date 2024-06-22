import { FootsiteSession } from "@core/footsites/entities/FootsiteSession";
import { StepHandlerParams } from "@core/job/StepHandlerParams";
import { getRandomAvailableVariant } from "@core/util/helpers";
import { BuyerTask } from "@entities/BuyerTask";
import { QueueFinish } from "@queueit/QueueFinish";
import cheerio from "cheerio";
import { differenceInMinutes, roundToNearestMinutes } from "date-fns";
import qs from "qs";
import UserAgent from "user-agents";
import { v1, v4 as uuidv4 } from "uuid";
import {
  DataDome,
  DataDomeChallengeResponse,
  GeeTest,
  RecaptchaChallengeResponse,
  RecaptchaV2Checkbox,
} from "../../core/challenge/Challenge";
import { MessageType } from "../../core/entities/MessageType";
import { ddExecuteCaptchaChallenge } from "../../core/footsites/footsite.service";
import { TaskStep } from "../../core/job/TaskStep";
import { TaskPage } from "../../core/task-page";
import { provinces, states } from "../../core/util/locales";
import { BuyerWorker } from "../worker/BuyerWorker";
import {
  AddToCart,
  CheckedOut,
  DatadomeBanned,
  Declined,
  GettingSession,
  InWaitingRoom,
  LoadingProductPage,
  WaitingInQueue,
} from "../worker/task-status";

const adyenEncrypt = require("node-adyen-encrypt")(18);

const baseDelay = 4000;
const maximumDelay = 5500;
const baseTimeout = 12000 - baseDelay;

export class FTLBuyerWorker extends BuyerWorker {
  uuid: string;
  preparedAddress: any;
  preparedBillingAddress: any;
  variantID?: string;
  ipAddress?: string;
  session?: FootsiteSession;

  sessionFetchInterval?: NodeJS.Timeout;
  wasAtCheckout: boolean = false;
  isNA: boolean;
  guid: string;

  dontModifyDelay: boolean = false;
  delay: number = baseDelay;

  constructor(request: BuyerTask) {
    super(request);
    this.ignoreServerErrors = false;
    this.uuid = v1();
    // user agent randomization, it's a thing now.

    const ua = new UserAgent();
    this.guid = "";
    this.setUserAgent(ua.toString());

    const cc = this.task.profile.address.country.code;

    this.isNA =
      (this.requestURL.endsWith(".com") || this.requestURL.endsWith(".ca")) &&
      (cc === "US" || cc === "CA");

    this.http.defaults.headers["Accept"] = "application/json";
    this.http.defaults.headers["User-Agent"] = this.userAgent;
    this.http.defaults.headers["accept-encoding"] = "gzip, deflate, br";
    this.http.defaults.headers["accept-language"] = "en-US,en;q=0.9";

    this.http.interceptors.request.use(
      (request) => {
        // request.headers["x-fl-request-id"] = uuidv4();
        request.headers["x-fl-request-id"] = v1();
        const cookies = this.jar.getCookiesSync(this.requestURL);

        // const sessionCookie = cookies.find((c) => c.key === "JSESSIONID");
        // if (sessionCookie) {
        //   request.headers["x-flapi-session-id"] = sessionCookie?.value;
        // }

        // if (request.url?.includes("/current/")) {
        //   const guid = cookies.find((c) => c.key === "cart-guid")?.value;
        //   if (guid) {
        //     request.url = request.url.replace("/current/", `/${guid}/`);
        //     console.log(request.url);
        //   }
        // }

        if (request.url?.includes("apigate")) {
          request.headers["x-api-key"] = this.requestURL.includes(
            "champssports"
          )
            ? "IdxjdARQ9ayGlCCJ3sp7GvWg6GjPI5tX"
            : "jv4A8eortRrSAPlKnaXEWBnntIy88R5S";
        } else {
          const sessionCookie = cookies.find((c) => c.key === "JSESSIONID");
          if (sessionCookie) {
            request.headers["x-flapi-session-id"] = sessionCookie?.value;
          }
        }

        if (
          request.method === "post" ||
          request.method === "POST" ||
          request.method === "put" ||
          request.method === "PUT"
        ) {
          request.headers["Content-Type"] = "application/json";
          if (this.session?.csrfToken) {
            request.headers["x-csrf-token"] = this.session?.csrfToken;
          }
        }
        request.headers["cache-control"] = "no-cache";
        request.headers["dnt"] = 1;
        request.headers["pragma"] = "no-cache";

        // console.log(request.headers);
        return request;
      },
      (error) => Promise.reject(error)
    );

    const { address, billingAddress } = this.task.profile!;
    const names = address.name.split(" ");
    const lastName = names[names.length - 1];
    const province =
      address.country.code === "CA"
        ? provinces.find((s) => s.abbreviation === address.stateProvinceRegion)
            ?.name
        : states.find((s) => s.abbreviation === address.stateProvinceRegion)
            ?.name;
    this.preparedAddress = {
      // LoqateSearch: "",
      setAsDefaultBilling: true,
      setAsDefaultShipping: true,
      firstName: names[0],
      lastName: lastName,
      email: address.email,
      phone: address.telephoneNumber,
      country: {
        isocode: address.country.code,
        name: address.country.name,
      },
      id: uuidv4(),
      setAsBilling: true,
      saveInAddressBook: true,
      // region: {
      //   countryIso: address.country.code,
      //   isocode: address.country.code
      //     .concat("-")
      //     .concat(address.stateProvinceRegion),
      //   isocodeShort: address.stateProvinceRegion,
      //   name: province,
      // },
      type: "default",
      line1: address.lineOne,
      line2: address.lineTwo || null,
      postalCode: address.zipPostal,
      town: address.cityTownVillage,
      regionFPO: null,
      shippingAddress: true,
      recordType: " ",
    };

    this.preparedAddress = this.isNA
      ? Object.assign(
          {
            LoqateSearch: "",
            region: {
              countryIso: address.country.code,
              isocode: address.country.code
                .concat("-")
                .concat(address.stateProvinceRegion),
              isocodeShort: address.stateProvinceRegion,
              name: province,
            },
          },
          this.preparedAddress
        )
      : this.preparedAddress;

    this.preparedBillingAddress = this.preparedAddress;
    if (billingAddress) {
      //
      const address = billingAddress;
      const names = billingAddress.name.split(" ");
      const lastName = names[names.length - 1];
      const province =
        address.country.code === "CA"
          ? provinces.find(
              (s) => s.abbreviation === billingAddress.stateProvinceRegion
            )?.name
          : states.find(
              (s) => s.abbreviation === billingAddress.stateProvinceRegion
            )?.name;
      this.preparedBillingAddress = {
        // LoqateSearch: "",
        setAsDefaultBilling: true,
        setAsDefaultShipping: true,
        firstName: names[0],
        lastName: lastName,
        email: billingAddress.email,
        phone: billingAddress.telephoneNumber,
        country: {
          isocode: billingAddress.country.code,
          name: billingAddress.country.name,
        },
        id: null,
        setAsBilling: true,
        saveInAddressBook: true,
        type: "default",
        line1: billingAddress.lineOne,
        line2: billingAddress.lineTwo || null,
        postalCode: billingAddress.zipPostal,
        town: billingAddress.cityTownVillage,
        regionFPO: null,
        shippingAddress: false,
        recordType: " ",
      };

      this.preparedBillingAddress = this.isNA
        ? Object.assign(
            {
              LoqateSearch: "",
              region: {
                countryIso: billingAddress.country.code,
                isocode: billingAddress.country.code
                  .concat("-")
                  .concat(billingAddress.stateProvinceRegion),
                isocodeShort: billingAddress.stateProvinceRegion,
                name: province,
              },
            },
            this.preparedAddress
          )
        : this.preparedAddress;
    }
  }

  protected _shutdown(): Promise<any> {
    if (this.sessionFetchInterval) {
      clearInterval(this.sessionFetchInterval);
    }
    return Promise.resolve();
  }

  protected _setup(): Promise<any> {
    this.jobExecutor.on("willRetryStep", (retryCount, error) => {
      // instead of every 3rd try, it's every try after 3 now
      // was a bug but I looike it

      if (retryCount >= 3) {
        const forEveryAfterThreeAddHundred = Math.max(
          (retryCount - 3) * 100,
          100
        );
        const total = baseDelay + forEveryAfterThreeAddHundred;

        this.setDelay(Math.min(total, maximumDelay));
      }
    });

    this.jobExecutor.on("willStartStep", (retryCount) => {
      if (this.delay !== baseDelay && !retryCount) {
        this.log(`Resetting delay. From ${this.delay} to ${baseDelay}`);
        this.setDelay(baseDelay);
      }
    });

    // this.addStep(TaskStep.DebugC, async (x) => {
    //   //https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAAAAMAeYw010ufufMAisc0PA==&cid=OMDyKwgqzU4ZR.Fkdat28see3nmHpwQWRsSKE6uzh6iU3H5AWhk9UjY2hMfdK.EOk-0jhCCXlmXnp~tRW90o80hzsHKUcfkRq0hutx1tCh&referer=www.champssports.com&hash=A55FBF4311ED6F1BF9911EB71931D5&t=fe&s=17434
    //   const captchaURL =
    //     "https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAAAAMAeYw010ufufMAisc0PA==&cid=OMDyKwgqzU4ZR.Fkdat28see3nmHpwQWRsSKE6uzh6iU3H5AWhk9UjY2hMfdK.EOk-0jhCCXlmXnp~tRW90o80hzsHKUcfkRq0hutx1tCh&referer=www.champssports.com&hash=A55FBF4311ED6F1BF9911EB71931D5&t=fe&s=17434";
    //   const captchaHTML = await this.get(captchaURL).then((r) => r.data);

    //   const geeTest = captchaHTML.includes("geetest.com");

    //   const captchaFrameCookies = this.jar.getCookiesSync(captchaURL);
    //   const datadome = captchaFrameCookies.find(
    //     (c) => c.key === "datadome"
    //   )?.value;
    //   const params = new URLSearchParams(captchaURL);

    //   // const path = String(response.request?.path);
    //   // const referralLocation = this.reqURLTrailing.concat(
    //   //   String(path.startsWith("/") ? path.substr(1, path.length) : path)
    //   // );

    //   // when it's 2cap/capmonster, answer is a string.
    //   // when it's manual, answer is an object
    //   this.log(`Requesting datadome from ${captchaURL}`);

    //   const apiServerRegex = /(api_server:\s?)\'(.*)\'/;
    //   const gtRegex = /(gt:\s?)\'(.*)\'/;
    //   const challengeRegex = /(challenge:\s?)\'(.*)\'/;

    //   let gt_apiServer = "";
    //   let gt_GT = "";
    //   let gt_Challenge = "";

    //   const gt_apiM = apiServerRegex.exec(captchaHTML);

    //   if (gt_apiM?.length) {
    //     gt_apiServer = gt_apiM[2];
    //   }

    //   const gt_GTM = gtRegex.exec(captchaHTML);

    //   if (gt_GTM?.length) {
    //     gt_GT = gt_GTM[2];
    //   }
    //   const gt_ChallengeM = challengeRegex.exec(captchaHTML);

    //   if (gt_ChallengeM?.length) {
    //     gt_Challenge = gt_ChallengeM[2];
    //   }

    //   this.updateStatus(
    //     `Solving datadome ${geeTest ? "geetest" : "captcha"} `,
    //     MessageType.Warning
    //   );

    //   const answer = await this.requestChallengeResponse<
    //     RecaptchaChallengeResponse | DataDomeChallengeResponse
    //   >({
    //     url: captchaURL,
    //     version: geeTest ? GeeTest : RecaptchaV2Checkbox,
    //     where: DataDome,
    //     cookies: captchaFrameCookies,
    //     userAgent: this.userAgent,
    //     siteKey: "6LccSjEUAAAAANCPhaM2c-WiRxCZ5CzsjR_vd8uX",
    //     html: captchaHTML,

    //     geetest_ApiServer: gt_apiServer,
    //     geetest_GT: gt_GT,
    //     geetest_Challenge: gt_Challenge,
    //   });

    //   console.log(answer);

    //   return x.next();
    // });

    // from playstation upon getting queued
    //   {
    //     "uuid": "3e4824f6-4137-45d3-a949-d9bcae7db12d",
    //     "queueUrl": "https://direct-queue.playstation.com/?c=sonyied&e=zeadljmayy&ver=v3-javascript-3.6.3&cver=309&man=Assign%20Action%20SafetyNet-Prod%20&t=https%3A%2F%2Fdirect.playstation.com%2Fen-us&kupver=akamai-1.0.2",
    //     "storeUrl": "https://www.footlocker.com",
    //     "redirectUrl": "https://direct.playstation.com/en-us",
    //     "triggerUrl": "https://www.footlocker.com",
    //     "blocked": false
    // }

    // this.addStep(TaskStep.DebugA, async (params) => {
    //   this.updateStatus("Queue it daddi");

    //   // const user = await this.requestQueueitUser(this.requestURL);

    //   const location =
    //     // "https://sonyied.queue-it.net/?c=sonyied&e=u1tvzb76f4&t=https%3A%2F%2Fdirect.playstation.com%2Fen-us&cid=en-US";
    //     // "https://direct-queue.playstation.com/?c=sonyied&e=zeadljmayy&ver=v3-javascript-3.6.3&cver=309&man=Assign%20Action%20SafetyNet-Prod%20&t=https%3A%2F%2Fdirect.playstation.com%2Fen-us&kupver=akamai-1.0.2";
    //     // "https://footlocker.queue-it.net/?c=footlocker&e=prod810dunksfl&t=https%3A%2F%2Fwww.footlocker.com%2Fen%2Fproduct%2F~%2FH0960600.html&cid=en-US";
    //     "https://footlocker.queue-it.net/?c=footlocker&e=prod0728wdunkcs&t=https%3A%2F%2Fwww.champssports.com%2Fen%2Fproduct%2F~%2FD1869103.html&cid=en-US";
    //   // const location = `https://inline.amd.com/?c=amd&e=usgk6sk52cm&ver=v3-javascript-3.6.3&cver=21&man=Queue%20US&t=https%3A%2F%2Fwww.amd.com%2Fen%2Fdirect-buy%2Fus&kupver=akamai-1.0.2`;

    //   const html = await this.get(location, { timeout: 5000 }).then(
    //     (r) => r.data
    //   );

    //   writeFile("sony", html);
    //   const page = new TaskPage(location, html);

    //   const goToRedirectUrl = async (
    //     fulfilled: QueueFinish
    //   ): Promise<boolean> => {
    //     return await this.get(fulfilled.redirectUrl, {
    //       timeout: 5000,
    //     })
    //       .then(() => true)
    //       .catch(async (e) => {
    //         const responseCode = e.request?.res?.statusCode;

    //         if (responseCode === 404) {
    //           console.log(`${fulfilled.redirectUrl} pulled, whatever.`);
    //           return false;
    //         }
    //         if (responseCode === 403) {
    //           console.log(`${fulfilled.redirectUrl} blocked me.`);
    //           return false;
    //         }
    //         if (responseCode === 429) {
    //           await this.rotateProxy();
    //         }

    //         return new Promise(async (resolve) => {
    //           if (!this.isShutdown) {
    //             const delay = await this.modifyDelay(this.delay);
    //             setTimeout(async () => {
    //               resolve(await goToRedirectUrl(fulfilled));
    //             }, delay);
    //           } else {
    //             resolve(false);
    //           }
    //         });
    //       });
    //   };
    //   // console.log(page);
    //   const fulfilled = await this.requestQueueFinish({
    //     triggerUrl: this.requestURL,
    //     page: page,
    //   });
    //   if (fulfilled && !fulfilled.blocked) {
    //     await goToRedirectUrl(fulfilled);
    //   }
    //   this.log(`FF: ${fulfilled?.blocked}`);

    //   return params.next();
    // });

    this.addStep(TaskStep.SetDelay, async (params) => {
      this.setDelay(baseDelay);

      this.hideTimedOut = true;
      this.hideRetry = true;
      this.forceIgnoreAvailability = true;
      this.log(`User Agent: ${this.userAgent}`);

      return params.next();
    });

    this.addStep(TaskStep.GettingSession, (params) => {
      // if (params.retryCount >= 10) {
      //   this.rotateProxy();
      // }

      return this.step_getSession(params);
    });
    this.addStep(TaskStep.NavigateToProductPage, async (params) => {
      this.updateStatus("Checking Queue-It");
      return await this.get(`/product/~/${this.task.monitor}.html`, {
        maxRedirects: 0,
      })
        .then((r) => {
          this.log("No Queue-It Redirect");
          return params.next();
        })
        .catch(async (e) => this.handleApiError(e, params));
    });

    this.addStep(TaskStep.QueueItComplete, (params) => {
      this.log("Queue Passed");
      this.sendQueueUser(this.requestURL);
      return params.next();
    });

    this.addStep(TaskStep.SelectVariant, (params) =>
      this.step_selectVariant(params)
    );

    this.addStep(TaskStep.AddingToCart, (params) =>
      this.step_addToCart(params)
    );

    // this.addStep(TaskStep.DebugA, async (params) => {
    //   const cookies = this.jar.getCookiesSync(this.requestURL);
    //   const guid = cookies.find((c) => c.key === "cart-guid")?.value;

    //   // const cart = await this.get("/api/users/carts/current").then(
    //   //   (r) => r.data
    //   // );

    //   const url = `/apigate/users/carts/?timestamp=${this.timestamp()}&eatmyass=true`;
    //   console.log("Our guid", guid);

    //   // console.log(cart.entries);

    //   console.log("patch");

    //   await this.put(
    //     url,
    //     {
    //       paymentDetailsId: uuidv4(),
    //       billingAddress: this.preparedBillingAddress,
    //     },
    //     {
    //       headers: {
    //         "content-type": "text/json",
    //       },
    //     }
    //   )
    //     .then((r) => {
    //       console.log(r.data);
    //       // return params.next();
    //     })
    //     .catch((e) => {
    //       console.log(e.response?.data);
    //       // return params.next();
    //     });
    //   console.log("post");

    //   await this.post(
    //     url,
    //     {
    //       // entries: cart.entries,
    //       eggbag: "parmesaisnasd",
    //     },
    //     {
    //       headers: {
    //         "content-type": "text/json",
    //       },
    //     }
    //   )
    //     .then((r) => {
    //       console.log("WEMADETHIS", r.data);
    //       // return params.next();
    //     })
    //     .catch((e) => {
    //       console.log(e.response?.data);
    //       // return params.next();
    //     });
    //   return params.next();
    // });

    this.addStep(TaskStep.SetPreloadingNegative, async (params) => {
      this.jar.setCookieSync("at_check=true", this.requestURL);

      return params.next();
    });

    // the info steps
    this.addStep(TaskStep.SubmittingEmail, (params) =>
      this.step_submitEmail(params)
    );

    // this.addStep(TaskStep.SetPreloadingNegative, async (params) => {
    //   await this.get("/api/v3/session").then((r) => console.log(r.data));

    //   return params.next();
    // });

    // this.addStep(TaskStep.SubmittingAddressInformation, (params) => {
    //   params.addAsyncStep(TaskStep.SubmittingShippingRate, (params) =>
    //     this.step_submitShipping(params)
    //   );

    // });

    this.addStep(TaskStep.SubmittingAddressInformation, (params) =>
      this.step_submitShipping(params)
    );
    // this.addStep(TaskStep.SetPreloadingNegative, async (params) => {
    //   await this.get("/api/v3/session").then((r) => console.log(r.data));

    //   return params.next();
    // });

    this.addStep(TaskStep.SubmittingBilling, (params) =>
      this.step_submitBilling(params)
    );

    this.addStep(TaskStep.EnterGiftCard, (params) =>
      this.step_enterGiftcard(params)
    );

    this.addStep(TaskStep.CheckingOut, (params) =>
      this.step_submitPayment(params)
    );

    return Promise.resolve();
  }

  timestamp() {
    return new Date().getTime();
  }

  async removeFromCart(): Promise<void> {
    this.log("Clearing Cart");
    return await this.delete(
      `/api/users/carts/current/entries/0?timestamp=${this.timestamp()}`
    ).then(() => {});
  }

  async handleApiError(
    axiosResponse: any,
    { retry, retryCount, next }: StepHandlerParams,
    logError: boolean = true
  ) {
    const location: string | undefined =
      axiosResponse.response?.headers["location"];

    if (location?.includes("queue-it.net")) {
      if (location.includes("/afterevent.aspx")) {
        this.log("Event is over, skipping ahead.");
        this.log(location);
        // the event is over, so let's go anyway?
        return next();
      }
      this.updateStatus("Queue-It In Progress", MessageType.Warning);

      const goToRedirectUrl = async (
        fulfilled: QueueFinish
      ): Promise<boolean> => {
        return await this.get(fulfilled.redirectUrl)

          .then((e) => true)
          .catch(async (e) => {
            const responseCode = e.request?.res?.statusCode;

            if (responseCode === 404) {
              this.log(`${fulfilled.redirectUrl} pulled, whatever.`);
              return false;
            }
            if (responseCode === 403) {
              this.log(`${fulfilled.redirectUrl} blocked me.`);
              return false;
            }
            if (responseCode === 302) {
              this.log(
                `${fulfilled.redirectUrl} redirected me. Probably expired`
              );
              return false;
            }
            if (responseCode === 429) {
              await this.rotateProxy();
            }

            return new Promise(async (resolve) => {
              if (!this.isShutdown) {
                const delay = await this.modifyDelay(this.delay, e);
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
        return retry(0);
      }

      const html: string | undefined = await this.get(location, {
        timeout: 4000,
      })
        .then((r) => r.data)
        .catch((e) => undefined);

      if (!html || html.toLowerCase().includes("back off")) {
        this.updateStatus("Queue-It Blocked", MessageType.Warning);
        this.log("Getting the queue-it page gave an error", MessageType.Error);
        this.log(`Queue-It Page: ${location}`);
        await this.rotateProxy();
        return retry(0);
      }

      const page = new TaskPage(location, html);

      const fulfilled = await this.requestQueueFinish({
        triggerUrl: this.requestURL,
        page: page,
      });
      if (fulfilled && !fulfilled.blocked) {
        await goToRedirectUrl(fulfilled);
      }

      return retry(0);
    }

    const response = axiosResponse.response;

    const responseCode = axiosResponse.request?.res?.statusCode;
    const apiError = axiosResponse.response?.data?.errors?.length
      ? axiosResponse.response?.data?.errors[0]?.message
      : undefined;

    if (
      axiosResponse?.message?.includes("timeout of") ||
      axiosResponse?.message === "requestTimeout"
    ) {
      // timeout message wasn't for us.
      throw axiosResponse;
    }

    if (responseCode && logError) {
      this.log(`Received error ${responseCode}`, MessageType.Warning);
      // this.log(`${JSON.stringify(response?.data || {}, null, 4)}`);
      if (apiError) {
        this.log(apiError, MessageType.Error);
      }
    }
    if (apiError) {
      this.log(apiError, MessageType.Error);
    }
    if (response && !apiError) {
      this.log(
        typeof response.data === "object"
          ? JSON.stringify(response.data, null, 4)
          : response.data || "No data",
        MessageType.Error
      );
    }
    if (responseCode === 529) {
      this.updateStatus(InWaitingRoom);
      const delay = Number(response.headers["refresh"]?.split(";")[0] || 30);
      const howLongToWait = Math.min(delay, 45) * 1000;
      this.log(
        `Waiting room suggest we wait ${delay} seconds, we will wait ${howLongToWait}ms.`
      );
      this.dontModifyDelay = true;

      return retry(howLongToWait);
    } else if (responseCode === 503) {
      this.updateStatus(WaitingInQueue);
    } else if (responseCode === 302) {
      let location = String(axiosResponse.request?.path);
      if (location?.includes("queue-it.net")) {
        this.log(
          "Queue-It is up, there's not much to do here but wait.",
          MessageType.Warning
        );
      }
    } else if (responseCode === 403) {
      try {
        const data = response?.data;

        const captchaURL: string = data?.url;
        if (captchaURL) {
          this.log("Captcha detected");
          const captchaHTML = await this.http
            .get(captchaURL)
            .then((r) => r.data)
            .catch((e) => undefined);

          // we can't even solve this it's 403.
          if (!captchaHTML) {
            this.updateStatus(DatadomeBanned, MessageType.Error);
            this.rotateIpAndReset();

            this.log("We'll retry.");
            return retry(this.delay);
          }

          const captchaDoc = cheerio.load(captchaHTML);
          const ipMatches = /(?:[0-9]{1,3}\.){3}[0-9]{1,3}/.exec(captchaHTML);
          let ipAddress = this.ipAddress;
          if (ipMatches) {
            ipAddress = ipMatches[0];
          }
          if (
            captchaDoc(".captcha__human__title")
              .text()
              ?.includes("been blocked")
          ) {
            this.updateStatus(DatadomeBanned, MessageType.Error);
            this.rotateIpAndReset();

            this.log("We'll retry.");
            return retry(this.delay);
          }

          const geeTest = captchaHTML.includes("geetest.com");

          const captchaFrameCookies = this.jar.getCookiesSync(captchaURL);
          const datadome = captchaFrameCookies.find(
            (c) => c.key === "datadome"
          )?.value;
          const params = new URLSearchParams(captchaURL);

          const path = String(response.request?.path);
          const referralLocation = this.reqURLTrailing.concat(
            String(path.startsWith("/") ? path.substr(1, path.length) : path)
          );

          // when it's 2cap/capmonster, answer is a string.
          // when it's manual, answer is an object
          this.log(`Requesting datadome from ${captchaURL}`);

          const apiServerRegex = /(api_server:\s?)\'(.*)\'/;
          const gtRegex = /(gt:\s?)\'(.*)\'/;
          const challengeRegex = /(challenge:\s?)\'(.*)\'/;

          let gt_apiServer = "";
          let gt_GT = "";
          let gt_Challenge = "";

          const gt_apiM = apiServerRegex.exec(captchaHTML);

          if (gt_apiM?.length) {
            gt_apiServer = gt_apiM[2];
          }

          const gt_GTM = gtRegex.exec(captchaHTML);

          if (gt_GTM?.length) {
            gt_GT = gt_GTM[2];
          }
          const gt_ChallengeM = challengeRegex.exec(captchaHTML);

          if (gt_ChallengeM?.length) {
            gt_Challenge = gt_ChallengeM[2];
          }

          this.updateStatus(
            `Solving datadome ${geeTest ? "geetest" : "captcha"} `,
            MessageType.Warning
          );

          const answer = await this.requestChallengeResponse<
            RecaptchaChallengeResponse | DataDomeChallengeResponse
          >({
            url: captchaURL,
            version: geeTest ? GeeTest : RecaptchaV2Checkbox,
            html: captchaHTML,
            where: DataDome,
            cookies: captchaFrameCookies,
            userAgent: this.userAgent,
            siteKey: "6LccSjEUAAAAANCPhaM2c-WiRxCZ5CzsjR_vd8uX",

            geetest_ApiServer: gt_apiServer,
            geetest_GT: gt_GT,
            geetest_Challenge: gt_Challenge,
          });

          const gt_a = answer as DataDomeChallengeResponse;

          const r =
            "https://geo.captcha-delivery.com/captcha/check?" +
            qs.stringify({
              cid: params.get("cid"),
              icid: response.headers["x-datadome-cid"],
              ccid: unescape(datadome || ""),

              ...(geeTest
                ? {
                    "geetest-response-challenge": gt_a.geetest_challenge,
                    "geetest-response-validate": gt_a.geetest_validate,
                    "geetest-response-seccode": gt_a.geetest_seccode,
                  }
                : {
                    "g-recaptcha-response": answer,
                  }),

              hash: params.get("hash"),
              ua: this.userAgent,
              referer: referralLocation.split("?")[0],
              parent_url: captchaURL?.split("&")[0] || this.reqURLTrailing,
              "x-forwarded-for": ipAddress,
              captchaChallenge: ddExecuteCaptchaChallenge(
                this.userAgent,
                params.get("cid") || "",
                10
              ),
              s: params.get("s"),
            });

          const checkURL = gt_a.checkURL ?? r;

          this.log("DataDome URL: ");
          this.log(r);

          const uri = new URL(checkURL);
          if (ipAddress) {
            uri.searchParams.set("x-forwarded-for", ipAddress);
          }

          this.log(uri.toString());
          await this.get(uri.toString(), {
            headers: {
              "content-type":
                "application/x-www-form-urlencoded; charset=UTF-8",
              "x-csrf-token": null,
            },
          })
            .then((r) => {
              return r.data.cookie;
            })
            .then(async (cookie) => {
              this.log("Loaded cookie properly");
              this.jar.setCookieSync(cookie, this.requestURL);
              await this.get(referralLocation, {
                headers: {
                  referer: captchaURL,
                },
              })
                .then((d) => this.log("Went to the depths."))
                .catch((e) =>
                  this.log(
                    "Nah, we didn't go to the depths",
                    MessageType.Warning
                  )
                );
            })
            .catch((e) => {
              this.log(
                `DD (Base): ${String(e?.message || e)}`,
                MessageType.Error
              );
              console.log(e);
            });
        }
      } catch (e: any) {
        this.log(`DD (Root): ${String(e?.message || e)}`, MessageType.Error);

        console.log(e);
      }
      this.log("Retrying using set delay, because we were datadomed.");
      return retry(this.delay);
    } else if (responseCode === 429) {
      this.updateSignal("Rate Limit");
      // return retry(this.maximumTimeout);
    } else if (responseCode === 502) {
      //  due to the high demand of this product
    } else if (responseCode === 550) {
      this.dontModifyDelay = true;
      // const presetDelay =
      //   delayPresets[Math.round(Math.random() * (delayPresets.length - 1))];
      // this.log(`Gonna use delay preset: ${presetDelay}`);
      // retry at no delay let's see..
      // this.log(`${JSON.stringify(response.headers)}`);
      return retry(0);
      // return retry(presetDelay);
      // but we will retry at half delay since it wasn't our error.
      // return retry(this.delay / 2);
    } else {
      if (responseCode) {
        this.updateSignal(`Unknown Code: ${responseCode}`);
        this.log(`Don't know about this response code: ${responseCode}`);
      } else {
        this.log(axiosResponse?.message, MessageType.Error);
      }
    }

    return retry(this.delay);
  }

  setDelay(delay: number) {
    this.delay = delay;

    const isBetweenTime = (start: number, end: number) => {
      const diff = !this.task.start
        ? Number.MAX_VALUE
        : differenceInMinutes(new Date(), this.task.start);

      return diff >= start && diff <= end;
    };

    if (isBetweenTime(0, 5)) {
      this.log("Setting delay within 0-5 minutes of starting.");

      this.http.defaults.timeout = 25000;
    } else if (isBetweenTime(5, 10)) {
      this.log("Setting delay within 5-10 minutes of starting.");
      this.http.defaults.timeout = 22000;
    } else {
      this.http.defaults.timeout = baseTimeout + delay;
    }
    this.log(
      `Delay set to ${delay}. Timeout set to ${this.http.defaults.timeout}`
    );
  }

  async step_selectVariant({ next, retry }: StepHandlerParams) {
    const product = await this.requestProduct();

    const { sizes } = this.task;

    // then go manually.
    const variant = getRandomAvailableVariant(
      product,
      sizes,
      this.forceIgnoreAvailability
    );

    if (variant) {
      this.variantID = variant.id;
    } else {
      this.log("None of the sizes we want are in stock.");
      this.updateStatus("Size(s) not in stock", MessageType.Warning);
      return retry(0);
    }
    return next();
  }

  rotateIpAndReset() {
    this.log("Remaking...");
    this.rotateProxy();
    const url = new URL(this.requestURL);

    this.cookieStore.removeCookie(url.host, "/", "datadome", (e) => {
      //
      // this.log(`${this.jar.getCookiesSync(this.requestURL)}`);
    });
    // this.jar.setCookieSync(`datadome=""`, this.requestURL);
    // this.getIpAddress();
  }

  _onRequestUpdated() {
    //
  }

  async step_submitPayment(params: StepHandlerParams) {
    const { next, error, retry, retryCount } = params;
    if (!this.wasAtCheckout) {
      this.wasAtCheckout = true;
    }
    this.updateStatus("Making Payment");

    const cookies = this.jar.getCookiesSync(this.requestURL);

    const guid = cookies.find((c) => c.key === "cart-guid")?.value;

    const adyenKey =
      "10001|A237060180D24CDEF3E4E27D828BDB6A13E12C6959820770D7F2C1671DD0AEF4729670C20C6C5967C664D18955058B69549FBE8BF3609EF64832D7C033008A818700A9B0458641C5824F5FCBB9FF83D5A83EBDF079E73B81ACA9CA52FDBCAD7CD9D6A337A4511759FA21E34CD166B9BABD512DB7B2293C0FE48B97CAB3DE8F6F1A8E49C08D23A98E986B8A995A8F382220F06338622631435736FA064AEAC5BD223BAF42AF2B66F1FEA34EF3C297F09C10B364B994EA287A5602ACF153D0B4B09A604B987397684D19DBC5E6FE7E4FFE72390D28D6E21CA3391FA3CAADAD80A729FEF4823F6BE9711D4D51BF4DFCB6A3607686B34ACCE18329D415350FD0654D";
    const { paymentCard } = this.task.profile!;

    const cseInstance = adyenEncrypt.createEncryption(adyenKey, {});

    const add = { ...this.preparedAddress };
    delete add.LoqateSearch;
    delete add.saveInAddressBook;
    delete add.type;

    const toPost = {
      browserInfo: {
        screenWidth: 2560,
        screenHeight: 1440,
        colorDepth: 24,
        userAgent: this.userAgent,
        timeZoneOffset: new Date().getTimezoneOffset(),
        language: "en-US",
        javaEnabled: false,
      },
      cartId: guid,
      deviceId: "",

      encryptedCardNumber: cseInstance.encrypt({
        number: paymentCard.cardNumber,
        generationtime: new Date().toISOString(),
      }),
      encryptedExpiryMonth: cseInstance.encrypt({
        expiryMonth: paymentCard.expirationMonth,
        generationtime: new Date().toISOString(),
      }),
      encryptedExpiryYear: cseInstance.encrypt({
        expiryYear: paymentCard.expirationYear,
        generationtime: new Date().toISOString(),
      }),
      encryptedSecurityCode: cseInstance.encrypt({
        cvc: paymentCard.verificationNumber,
        generationtime: new Date().toISOString(),
      }),
      paymentMethod: "CREDITCARD",
      preferredLanguage: "en",

      // defaultPayment: true,
      // // cock: "bruh",
      // // email: add.email,
      // shippingAddress: add,
      // billingAddress: add,

      returnUrl: this.reqURLTrailing + "adyen/checkout",
      termsAndCondition: this.isNA ? false : true,
    };

    return await this.post(
      this.isNA
        ? `/api/v2/users/orders?timestamp=${this.timestamp()}`
        : `/api/users/orders/adyen?timestamp=${this.timestamp()}`,
      toPost,
      {
        headers: {
          origin: this.requestURL,
          referer: this.reqURLTrailing + "checkout",
          "accept-language": "en-US,en;q=0.9",
        },
      }
    )
      .then((r) => {
        const k = String(r.data).toLowerCase();
        if (k.includes("<body>")) {
          this.log(
            "The checkout sent us to EU site, refreshing",
            MessageType.Warning
          );
          if (retryCount >= 3) {
            return next(TaskStep.SubmittingEmail);
          }

          return retry(this.delay);
        }
        try {
          this.log(JSON.stringify(r.data || {}, null, 2), MessageType.Good);
        } catch (e: any) {
          this.log(e?.message, MessageType.Error);
        }
        this.notifyCheckout(true);

        // r.data.order.code
        this.updateStatus(CheckedOut, MessageType.Good);
        return next();
      })
      .catch(async (httpError) => {
        const responseCode = httpError.request?.res?.statusCode;
        // this.log(this.jar.getCookieStringSync(this.requestURL));

        if (responseCode === 400) {
          const apiError: string | undefined = httpError.response?.data?.errors
            ?.length
            ? httpError.response?.data?.errors[0]?.message
            : undefined;

          if (apiError) {
            this.log(`Received error from server: ${apiError}`);

            if (apiError.includes("payment method")) {
              this.notifyCheckout(false);
              return error(Declined);
            } else if (apiError.includes("empty")) {
              this.log(`Cart emptied, retrying atc`);
              return next(TaskStep.AddingToCart);
            } else if (apiError.includes("Reservation")) {
              this.log(`Reservation expired`);
              return next(TaskStep.AddingToCart);
            } else if (apiError.includes("street")) {
              return error("Street Address Error");
            } else if (apiError.includes("process")) {
              this.log("Payment might be processing, we'll retry anyway.");
              this.updateStatus("Payment Processing");
            } else if (apiError.includes("international")) {
              this.log(
                `This item doesn't ship to this profile's country (${this.task.profile.address.country.name}) `,
                MessageType.Error
              );
              return error("Shipping Not Available");
            }
          }
          return retry(this.delay);
        } else {
          return this.handleApiError(httpError, params);
        }
      });
  }

  async step_enterGiftcard(params: StepHandlerParams) {
    return params.next();
    // const { giftCard } = this.task.profile!;
    // if (!this.isNA) {
    //   this.log("Skipping, EU gift cards not supported");
    //   return params.next();
    // }
    // if (!giftCard || !giftCard.code) {
    //   this.log("We don't have a gift card to apply");
    //   return params.next();
    // }
    // if (!giftCard.pin) {
    //   this.log("Gift card doesn't have a pin, skipping", MessageType.Warning);
    //   return params.next();
    // }

    // this.log("Applying gift card");
    // const id = this.http.interceptors.response.use(
    //   (r: AxiosResponse) => r,
    //   (r) => {
    //     if (r.message && !/cookie/i.test(r.message)) {
    //       throw r;
    //     } else {
    //       // console.log("About the cookie huh");
    //     }
    //   }
    // );
    // this.reportUnknownErrors = false;
    // return await this.post(
    //   `/api/users/carts/current/add-giftcard?timestamp=${this.timestamp()}`,
    //   {
    //     svcNumber: giftCard.code.replaceAll(" ", ""),
    //     svcPIN: giftCard.pin.replaceAll(" ", ""),
    //   }
    // )
    //   .then((r) => {
    //     const j = String(r?.data || "").toLowerCase();
    //     if (j.includes("<body>")) {
    //       this.log(
    //         "Returned a html".concat("\n").concat(j),
    //         MessageType.Warning
    //       );
    //       return params.retry(this.delay);
    //     }
    //     this.reportUnknownErrors = true;

    //     this.http.interceptors.response.eject(id);

    //     this.log("Gift card *potentially* applied.");
    //     return params.next();
    //   })
    //   .catch((axiosResponse) => {
    //     this.reportUnknownErrors = true;

    //     this.http.interceptors.response.eject(id);

    //     const responseCode = axiosResponse.request?.res?.statusCode;

    //     const apiError = axiosResponse.response?.data?.errors?.length
    //       ? axiosResponse.response?.data?.errors[0]?.message
    //       : undefined;
    //     if (responseCode === 500) {
    //       this.log(
    //         "Gift card was probably formatted wrong. Skipping",
    //         MessageType.Warning
    //       );
    //       return params.next();
    //     } else if (responseCode === 400) {
    //       this.log("Gift card was unsuccessful", MessageType.Warning);
    //       this.log(
    //         apiError || "Invalid response from server",
    //         MessageType.Error
    //       );
    //       return params.next();
    //     } else {
    //       return this.handleApiError(axiosResponse, params, false);
    //     }
    //   });
  }

  async step_submitBilling(params: StepHandlerParams) {
    const { next, retry } = params;
    this.updateStatus("Submitting Info");

    this.log("Phase 3");

    return await this.post(
      `/api/users/carts/current/set-billing?timestamp=${this.timestamp()}`,
      this.preparedBillingAddress,
      {
        headers: {
          origin: this.requestURL,
          referer: this.reqURLTrailing + "checkout",
          "accept-language": "en-US,en;q=0.9",
        },
      }
    )
      .then((r) => {
        const j = String(r?.data || "").toLowerCase();
        if (j.includes("<body>")) {
          this.log(
            "Returned a html".concat("\n").concat(j),
            MessageType.Warning
          );
          return retry(this.delay);
        }
        return next();
      })
      .catch((e) => this.handleApiError(e, params));
  }

  async step_submitShipping(params: StepHandlerParams) {
    this.updateStatus("Submitting Info");

    this.log("Phase 2");
    const { next, retry } = params;

    const addy = {
      shippingAddress: this.preparedAddress,
    };
    return await this.post(
      `/api/users/carts/current/addresses/shipping?timestamp=${this.timestamp()}`,
      addy,
      {
        headers: {
          origin: this.requestURL,
          referer: this.reqURLTrailing + "checkout",
          "accept-language": "en-US,en;q=0.9",
        },
      }
    )
      .then((r) => {
        const j = String(r?.data || "").toLowerCase();
        if (j.includes("<body>")) {
          this.log(
            "Returned a html".concat("\n").concat(j),
            MessageType.Warning
          );
          return retry(this.delay);
        }
        return next();
      })
      .catch((e) => this.handleApiError(e, params));
  }

  async step_submitEmail(params: StepHandlerParams) {
    const { next, retry, retryCount } = params;
    this.updateStatus("Submitting Info");

    this.log("Phase 1");
    return await this.put(
      // api

      `/api/users/carts/current/email/${
        this.task.profile!.address.email
      }?timestamp=${this.timestamp()}`,
      undefined,

      {
        headers: {
          origin: this.requestURL,
          referer: this.requestURL + "/checkout",
          "accept-language": "en-US,en;q=0.9",
        },
        ...(retryCount
          ? {
              requestTimeout:
                retryCount <= 10 ? this.delay : retryCount >= 17 ? 11000 : 9000,
            }
          : {}),
      }
    )
      .then((r) => {
        const j = String(r?.data || "").toLowerCase();
        if (j.includes("<body>")) {
          this.log(
            "Returned a html".concat("\n").concat(j),
            MessageType.Warning
          );
          return retry(this.delay);
        }
        return next();
      })
      .catch((e) => this.handleApiError(e, params));
  }

  async step_goToProductPage(params: StepHandlerParams) {
    this.updateStatus(LoadingProductPage);
    const product = await this.requestProduct();

    return await this.get(product.url)
      .then(() => params.next())
      .catch((e) => this.handleApiError(e, params));
  }

  async step_addToCart(params: StepHandlerParams) {
    const { next, retry, previousStep } = params;
    this.updateStatus(AddToCart);

    if (this.task.product) {
      this.updateTask((t) => (t.product = undefined));
    }
    const p = await this.requestProduct();
    const v = p.variants.find((v) => v.id === this.variantID)!;
    this.log(`Adding ${p.title} variant: ${v.id} size ${v.size}`);

    return await this.post(
      `/api/users/carts/current/entries?timestamp=${this.timestamp()}`,
      {
        productQuantity: 1,
        productId: this.variantID,
      },
      {
        headers: {
          referer: `${this.reqURLTrailing}product/~/${this.task.monitor!}.html`,
          origin: this.requestURL,
          "x-fl-productid": this.variantID,
          "accept-language": "en-US,en;q=0.9",
        },
      }
    )
      .then((r) => {
        this.log(r.data.appliedCoupons ? "Cart was proper" : "Not a cart");
        // this.log(
        //   typeof r.data === "object"
        //     ? JSON.stringify(r.data, null, 4)
        //     : String(r.data || "?")
        // );
        if (!r.data.appliedCoupons) {
          this.log(
            typeof r.data === "object"
              ? JSON.stringify(r.data, null, 4)
              : String(r.data || "?")
          );
          return retry(this.delay);
        } else {
          // console.log(r.data);
          this.setDetails(p, v);
          if (this.wasAtCheckout) {
            return next(TaskStep.CheckingOut);
          }
          return next();
        }
      })
      .catch((e) => {
        const responseCode = e.request?.res?.statusCode;
        const apiError: string | undefined = e.response?.data?.errors?.length
          ? e.response?.data?.errors[0]?.message
          : undefined;
        if (apiError && /cart not found/i.test(apiError)) {
          this.log("Our cart was deleted.", MessageType.Warning);
          const url = new URL(this.requestURL);
          this.cookieStore.removeCookie(url.host, "/", "cart-guid", (e) => {
            //
          });

          return retry(this.delay);
        }
        if (
          responseCode === 531 ||
          (responseCode == 400 && apiError?.includes("out of stock"))
        ) {
          const v = p.variants.find((a) => a.id === this.variantID);
          this.log(`Size ${v!.size} OOS`, MessageType.Warning);
          this.setDelay(baseDelay);
          if (!this.setAnotherVariant(p)) {
            this.log(
              `Product is out of stock. All variants tried.`,
              MessageType.Error
            );
            this.attemptedVariantIDs.clear();
            this.setAnotherVariant(p);
            return retry(this.delay);
          }
          return retry(this.delay);
        } else {
          return this.handleApiError(e, params);
        }
      });
  }

  modifyDelay(delay: number, error?: Error): number {
    if (error?.message.includes("timeout of")) {
      this.log("Immediate retry because we timed out.");
      return 0;
    }
    if (!this.session && error?.message === "requestTimeout") {
      this.log("Connecting to the proxy failed, so we will rotate.");
      this.rotateProxy();
      this.setDelay(baseDelay);
    }

    if (this.dontModifyDelay) {
      this.log("In the waiting room, so will use the delay we were given.");
      this.dontModifyDelay = false;
      return delay;
    }

    // console.log("Error!");
    const now = new Date();

    const millisecondsToNextMinute = roundToNearestMinutes(now);

    const differenceBetweenNextMinuteAndNow = Math.abs(
      millisecondsToNextMinute.getTime() - now.getTime()
    );

    if (differenceBetweenNextMinuteAndNow < delay) {
      return Math.max(differenceBetweenNextMinuteAndNow, 200);
    } else {
      return delay;
    }
  }

  async getSession() {
    if (!this.session) {
      this.updateStatus(GettingSession);
    } else {
      this.log("Refreshing session");
    }
    const version = this.isNA
      ? this.requestURL.includes("footlocker.ca")
        ? "v4"
        : "v3"
      : "";

    return await this.get(
      `/api/${version}/session?timestamp=${this.timestamp()}`
      // {
      //   requestTimeout: sessionRequestTimeout,
      // }
    ).then((r) => {
      this.session = r.data.data?.csrfToken ? r.data.data : this.session;
      // console.log(this.session);
    });
  }

  async step_getSession(params: StepHandlerParams) {
    const { next, retry } = params;
    return this.getSession()
      .then(() => {
        if (!this.session) {
          this.log("no session received brodie");
          return retry(this.delay);
        }
        this.sessionFetchInterval = setInterval(
          () =>
            this.getSession()
              .then(() => this.log("Session refreshed."))
              .catch((e) =>
                this.log(
                  `Session refresh failed: ${e.message || ""}`,
                  MessageType.Warning
                )
              ),
          3 * (60 * 1000)
        );
        return next();
      })
      .catch((e) => this.handleApiError(e, params));
  }
}
