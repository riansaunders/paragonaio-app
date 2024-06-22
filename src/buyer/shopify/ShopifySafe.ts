import { StepHandlerParams } from "@core/job/StepHandlerParams";
import { ShopifyProduct } from "@core/shopify/entities/ShopifyProduct";
import { ShopifyProductVariant } from "@core/shopify/entities/ShopifyProductVariant";
import { getProducts } from "@core/shopify/shopify.service";
import {
  getRandomAvailableVariant,
  normalizeUrl,
  removeAllExceptSelectorFromHtml,
  writeFile,
} from "@core/util/helpers";
import { BuyerTask } from "@entities/BuyerTask";
import cheerio from "cheerio";
import { roundToNearestMinutes } from "date-fns";
import qs from "qs";
import UserAgent from "user-agents";
import { BrowserPage } from "../../core/browser/BrowserPage";
import {
  HCaptchaChallengeResponse,
  HCaptchaCheckbox as HCaptcha,
  RecaptchaChallengeResponse,
  RecaptchaV2Checkbox as RecaptchaV2,
  RecaptchaV3Score,
  ShopifyCheckpoint,
  ShopifyLogin,
} from "../../core/challenge/Challenge";
import { MessageType } from "../../core/entities/MessageType";
import { TaskStep } from "../../core/job/TaskStep";
import { provinces, states } from "../../core/util/locales";
import { BuyerWorker } from "../worker/BuyerWorker";
import { Preload } from "../worker/task-flags";
import {
  AddToCart,
  BillingAddressError,
  CheckedOut,
  CheckingStatus,
  Declined,
  FailedToLogIn,
  InWaitingRoom,
  LoadingSite,
  LoggingIn,
  Preloading,
  SubmittingBilling,
  SubmittingRate,
  WaitingInQueue,
  WaitingInQueuePreloading,
} from "../worker/task-status";

export class ShopifySafe extends BuyerWorker {
  isPreloading: boolean = false;

  paymentSession?: string;

  checkoutIdToken?: string;

  browser: BrowserPage;

  preloadedVariant?: ShopifyProductVariant;

  browserDetails = {
    checkout: {
      client_details: {
        browser_width: 412,
        browser_height: 823,
        javascript_enabled: 1,
        color_depth: 24,
        java_enabled: false,
        browser_tz: new Date().getTimezoneOffset(),
      },
    },
  };

  preparedBrowserDetails = qs.stringify(this.browserDetails);
  returnToATC: boolean = false;
  checkoutUrl?: string;
  lastCheckoutStep?: string;

  constructor(task: BuyerTask) {
    super(task);

    const ua = new UserAgent();
    this.setUserAgent(ua.toString());

    this.browser = new BrowserPage(this.requestURL, this.http, this.userAgent);
  }

  protected _shutdown(): Promise<any> {
    this.browser.close();
    return Promise.resolve();
  }

  protected _setup(): Promise<any> {
    this.http.defaults.headers["accept-language"] = "en-US,en;q=0.9";
    this.http.defaults.headers["cache-control"] = "no-cache";
    this.http.defaults.headers["pragma"] = "no-cache";
    this.http.interceptors.response.use(
      (response) => response,
      async (error) => {
        const code = error.request?.res?.statusCode;

        if (code === 429) {
          this.updateStatus("Throttled: 429", MessageType.Warning);
          this.log(
            "Potentially banned. Some sites like kith do this",
            MessageType.Error
          );
          await this.rotateProxy();
        }
        return Promise.reject(error);
      }
    );
    this.browser.setSyncEventHandler({
      willNavigate: (url) => {
        this.log(`Will navigate to ${url}`);
      },

      didNavigate: async (previousUrl) => {
        if (this.isShutdown) {
          return;
        }
        const browser = this.browser;

        const success = browser.selector("[data-step='thank_you']");
        const pageNotice = browser
          .selector(".notice")
          ?.not(".hidden")
          ?.children("div")
          ?.text()
          ?.toLocaleLowerCase();

        if (success.html() || pageNotice.includes("already been purchased")) {
          this.notifyCheckout(true);
          this.updateStatus(CheckedOut, MessageType.Good);
          this.shutdown();

          return TaskStep.Complete;
        }

        const url = new URL(browser.getUrl());
        const str = url.toString();

        this.log(`Navigated to ${str}`);

        // 5s timeout on queue
        // if (str.includes("/throttle")) {
        //   this.http.defaults.timeout = 8 * 1000;
        //   this.log(`Timeout set because of queue to 8s`);
        // } else {
        //   // reset every where else.
        //   this.http.defaults.timeout = this.task.group.timeout * 1000;
        //   this.log(`Timeout reset to ${this.http.defaults.timeout}`);
        // }

        if (str.includes("/throttle")) {
          this.updateStatus(
            this.isPreloading ? WaitingInQueuePreloading : WaitingInQueue
          );
          // writeFile("queue", browser.html());
          if (!str.includes("?no_js=true")) {
            return await this.browser.goTo("/throttle/queue?no_js=true");
          } else {
            return await new Promise<any>((resolve) => {
              setTimeout(async () => {
                if (this.isShutdown) {
                  return resolve({});
                }

                resolve(await this.browser.refresh());
              }, 1000);
            });
          }
          // do nothing, it's a checkout
        } else if (str.includes("/thank_you")) {
          this.notifyCheckout(true);
          this.updateStatus(CheckedOut, MessageType.Good);
          this.shutdown();
          return TaskStep.Complete;
        } else if (str.includes("/checkpoint")) {
          // will only ever go to here if we have an account, or we should at least.

          // const isRecap =
          //   !browser.selector("[name='hcaptcha_data']").length ||
          //   !browser.html().includes("hcaptcha.com");

          const isRecap = !browser.selector("script[src^=https://hcaptcha]")
            .length;
          this.log(`Checkpoint detected. Recap: ${isRecap}`);

          //   let html: string | undefined;
          let response: string;

          const captchaHtml = this.removeAllExceptSelectorFromHtml(
            "[action='/checkpoint']"
          );

          // const captchaHtml = browser.html();

          if (
            !browser.selector("[name='hcaptcha_data']").length &&
            !browser.html().includes("hcaptcha.com") &&
            !browser.selector(".g-recaptcha").length
          ) {
            this.log("Throttled captcha detected, refreshing.");
            return await browser.refresh();
          }
          let rHtml;
          let r: RecaptchaChallengeResponse | HCaptchaChallengeResponse;

          if (isRecap) {
            r = await this.requestChallengeResponse<RecaptchaChallengeResponse>(
              {
                url: decodeURI(browser.getUrl()),
                where: ShopifyCheckpoint,
                version: RecaptchaV2,
                html: captchaHtml,
                siteKey: "",
              }
            );
            rHtml = r.html;
            response = r.token;
          } else {
            r = await this.requestChallengeResponse<HCaptchaChallengeResponse>({
              url: decodeURI(browser.getUrl()),
              version: HCaptcha,
              where: ShopifyCheckpoint,
              html: captchaHtml,
              siteKey: "",
            });
            writeFile("hcaptchacheckpoint", captchaHtml);
            rHtml = r.html;
            response = (r as HCaptchaChallengeResponse).hcaptcha;
          }

          const doc = cheerio.load(rHtml!);

          const addIfAbsent = (selector: string, value: string) => {
            const rr = doc(selector);
            if (rr.length && !rr.val()) {
              doc(selector).val(value);
            }
          };

          if (isRecap) {
            r = r as RecaptchaChallengeResponse;
            addIfAbsent("[name='g-recaptcha-response']", r.token);
          } else {
            let h = r as HCaptchaChallengeResponse;
            addIfAbsent("[name='hcaptcha_challenge_response_token']", h.token);
            addIfAbsent("[name='g-recaptcha-response']", h.recaptcha ?? "");
            addIfAbsent("[name='h-captcha-response']", h.hcaptcha ?? "");
            console.log(h);
          }

          const form = doc("[action='/checkpoint']").serialize();

          await browser.submitForm("[action^='/checkpoint']", form);
        } else if (str.includes("/account/login")) {
          const account = this.task.account;
          if (!account) {
            return this.error("Account Required");
          }
        } else if (str.includes("/processing") || str.includes("?validate")) {
          await this.checkStatus();
        } else if (str.includes("/checkouts/")) {
          // this is just the result of coming back from processing, dw about it.
          if (
            str.includes("?validate") &&
            (previousUrl.includes("/processing") ||
              previousUrl.includes("?validate"))
          ) {
            return;
          }
          this.checkoutUrl = normalizeUrl(
            str.split("?")[0].replace("stock_problems", "")
          );
          this.applyAntiBot();

          if (pageNotice) {
            this.log(`Notice: ${pageNotice}`);
          }

          const step = browser.selector(".step").attr("data-step");
          const uStep = new URL(str).searchParams.get("step");

          if (uStep !== step) {
            this.log(
              `Inferred step ${step} and url step ${uStep} are different.`,
              MessageType.Warning
            );
            this.log(`Inferred Step: ${step} | Url step: ${uStep}`);
            this.log(`Checkout url: ${this.checkoutUrl}`);
          }
          if (!step) {
            this.jar.removeAllCookiesSync();
            this.log(`Removed all cookies`);
            this.log(`Loaded a refresh page, refreshing`);
            this.log(this.jar.getCookieStringSync(this.requestURL));
            return await this.browser.goTo(`/cart/${this.variantID}:1`);
          }

          this.log(
            "Navigated to checkout step: " +
              step +
              " from " +
              this.lastCheckoutStep ?? "none"
          );

          // our browser only goes to the checkout pages anyway..
          if (this.isSoldOut()) {
            this.returnToATC = true;
            this.updateStatus("Sold Out - Switching", MessageType.Warning);
            const product = await this.requestProduct();
            if (this.setAnotherVariant(product)) {
              await this.removeProduct();
              return;
            }
            return await this.waitOnStock();
          }

          this.lastCheckoutStep = step || this.lastCheckoutStep;

          if (step === "contact_information") {
            await this.submitAddress();
          } else if (step === "shipping_method") {
            await this.submitShippingRate();
          } else if (step === "payment_method") {
            if (this.isPreloading) {
              return;
            }

            if (pageNotice?.includes("total has changed")) {
              return this.browser
                .goTo("/cart")
                .then(() =>
                  this.browser.goTo(
                    this.checkoutUrl!.concat("?step=payment_method")
                  )
                );
            }

            await this.submitPayment();
          }
        }
      },
      willSubmitForm: (url, _, value) => {
        let output: string | undefined = undefined;
        if (url.includes("/checkouts/")) {
          const step = this.browser.selector(".step").attr("data-step");

          if (step === "contact_information") {
            if (value.checkout?.buyer_accepts_marketing) {
              value.checkout.buyer_accepts_marketing = "0";
            }
          } else if (step === "shipping_method") {
            const rate = cheerio(
              this.browser.selector("[data-shipping-method]")[0]
            ).attr("data-shipping-method");

            if (!value.checkout) {
              value.checkout = {
                shipping_rate: {},
              };
            }
            value.checkout.shipping_rate.id = rate;
          } else if (step === "payment_method") {
            const b = this.browser;

            if (
              b.selector(
                "[name='checkout[attributes][I-agree-to-the-Terms-and-Conditions]']"
              ).length
            ) {
              if (!value.checkout.attributes) {
                value.checkout.attributes = {};
              }
              value.checkout.attributes["I-agree-to-the-Terms-and-Conditions"] =
                "Yes";
            }
            if (value.checkout.remember_me) {
              value.checkout.remember_me = false;
            }
            value.checkout.payment_gateway =
              b
                .selector("[data-gateway-name='credit_card']")
                .attr("data-select-gateway") || value.checkout.payment_gateway;
            const { address, billingAddress } = this.task.profile;

            const supportsDiffBilling = b.selector(
              "[name='checkout[different_billing_address]']"
            ).length
              ? true
              : false;

            if (!supportsDiffBilling && billingAddress) {
              this.updateStatus(
                "Different Billing Not Supported, Continuing",
                MessageType.Warning
              );
            }

            value.checkout.different_billing_address =
              billingAddress && supportsDiffBilling ? true : false;

            if (value.checkout.different_billing_address) {
              if (!value.checkout.billing_address) {
                value.checkout.billing_address = {};
              }
              const addy = billingAddress ?? address;
              const names = addy.name.split(" ");
              const lastName = names[names.length - 1];

              value.checkout.billing_address.first_name = names[0];
              value.checkout.billing_address.last_name = lastName;
              value.checkout.billing_address["address1"] = addy.lineOne;
              value.checkout.billing_address["address2"] = addy.lineTwo || "";
              value.checkout.billing_address["city"] = addy.cityTownVillage;
              value.checkout.billing_address["country"] = addy.country.name;
              value.checkout.billing_address["province"] =
                addy.stateProvinceRegion;
              value.checkout.billing_address["zip"] = addy.zipPostal;
              value.checkout.billing_address["phone"] = addy.telephoneNumber;
            } else {
              delete value.checkout.billing_address;
            }

            delete value.hosted_fields_redirect;
          }
          // console.log(value.checkout);
          // console.log(value);
          if (value.checkout) {
            if (
              this.browser.selector(
                `[name="checkout[attributes][I-agree-to-the-Terms-and-Conditions]"]`
              ).length
            ) {
              if (!value.checkout.attributes) {
                value.checkout.attributes = {};
              }
              value.checkout.attributes["I-agree-to-the-Terms-and-Conditions"] =
                "Yes";
            }

            // value.checkout = {
            //   ...value.checkout,
            //   ...this.browserDetails.checkout,
            // };

            output = qs
              .stringify(value, {
                arrayFormat: "repeat",
              })
              .concat("&")
              .concat(
                qs.stringify({
                  checkout: this.browserDetails.checkout,
                })
              );
          }
        }
        this.log(`Will submit form: ${url}`);
        this.log(JSON.stringify(value, null, 4));

        if (output) {
          this.log("--Output--");
          this.log(output);
          this.log("As object:");
          this.log(JSON.stringify(qs.parse(output), null, 4));
          return output;
        }
      },
    });
    this.addStep(TaskStep.PreloadPaymentSession, async (params) => {
      this.getPaymentSession()
        .then((r) => (this.paymentSession = r))
        .catch((e) => {
          //
          this.log("Failed to preload payment session");
        });
      return params.next();
    });

    this.addStep(TaskStep.NavigatingToSite, (params) =>
      this.step_goToSite(params)
    );

    // this.addStep(TaskStep.DebugB, async (params) => {
    //   await this.browser.goTo("/checkpoint");
    //   return params.next();
    // });

    this.addStep(TaskStep.LoggingIn, (params) => this.step_login(params));

    const prels = this.isFlagSet(Preload);
    // const experimental = false; // this.isFlagSet(Experimental);

    // const experimentalPreload = prels && experimental;

    // Preloading

    if (prels) {
      this.addStep(TaskStep.EmitExtraInfo, (params) => {
        this.log("Using Preload");
        return params.next();
      });

      this.addStep(TaskStep.SetPreloadingPositive, (params) => {
        this.isPreloading = true;
        return params.next();
      });
      this.addStep(TaskStep.PreloadingATC, (params) =>
        this.step_preloadAddRandomProduct(params)
      );
      this.addStep(TaskStep.PreloadingStartCheckout, (params) =>
        this.step_checkout(params)
      );

      this.addStep(TaskStep.PreloadingClearCart, (params) =>
        this.step_preloadClearCart(params)
      );

      this.addStep(TaskStep.SetPreloadingNegative, (params) => {
        this.isPreloading = false;

        this.log("Finished preloading");
        return params.next();
      });
    }
    this.addStep(TaskStep.SelectVariant, (params) =>
      this.step_selectVariant(params)
    );
    this.addStep(TaskStep.DebugA, (params) => {
      console.time("debugA");
      console.time("ATC");

      return params.next();
    });

    this.addStep(TaskStep.AddingToCart, (params) =>
      this.step_addToCart(params)
    );

    this.addStep(TaskStep.GetCheckout, (params) => this.step_checkout(params));

    return Promise.resolve();
  }
  async removeProduct() {
    await this.get("/cart/clear.js").then(() =>
      this.log("We removed the product from our cart")
    );
  }

  async hasItemInCart(): Promise<boolean> {
    return await this.get("/cart.js")
      .then((r) => r.data)
      .then((d) => d.items);
  }

  async getRandomAvailableVariant(
    products: ShopifyProduct[]
  ): Promise<ShopifyProductVariant | undefined> {
    let all: ShopifyProductVariant[] = [];
    for (let p of products) {
      const hasReleaseDate = p.tags.find((t) => t.startsWith("release-date:"));
      if (hasReleaseDate) {
        continue;
      }
      all.push(...p.variants.filter((p) => p.available));
    }

    all = all.sort((a, b) => Number(a.price) - Number(b.price));
    all = all.filter((a) => Number(a.price) >= 50) || all;

    // We only want the first half of entries, so we have the best chance at the lowest price, so things don't get too crazy.
    all = all.slice(0, all.length / 2);

    const j = Math.floor(Math.random() * all.length);

    return all[j < 0 ? 0 : j];
  }

  async step_preloadClearCart({ next }: StepHandlerParams) {
    this.log("Clearing our preload");
    return this.removeProduct()
      .then(() => next())
      .catch(() => next());
  }

  async step_preloadAddRandomProduct({ next }: StepHandlerParams) {
    this.updateStatus(Preloading);
    const { products } = await getProducts(this, this.requestURL, 250);
    const variant = await this.getRandomAvailableVariant(products);

    if (!variant) {
      this.log(
        "This site doesn't have anything that can be used for preloading!",
        MessageType.Warning
      );
      this.log(`Aborting preload`, MessageType.Warning);

      this.isPreloading = false;
      return next(TaskStep.SelectVariant);
    }
    this.log(`Got random in stock variant: ${variant?.id}`);
    this.log(`Price: ${variant.price}`);
    await this.post(
      `/cart/add.js`,
      qs.stringify({
        // id: 39603549307086,
        id: Number(variant?.id),
        quantity: 1,
      })
    );
    this.preloadedVariant = variant;

    return next();
  }

  isSoldOut() {
    const b = this.browser;

    return b.getUrl().includes("stock_problems") ||
      b.selector(".product__status--sold-out").text()
      ? true
      : false;
  }
  applyAntiBot() {
    const url = this.checkoutUrl;
    if (!url) {
      return;
    }
    let prefix = "#fs_";
    const checkoutStr = "/checkouts/";
    let shopifyToken = url
      .substr(url.indexOf(checkoutStr) + checkoutStr.length)
      .split("?")[0];

    let antibotInputName = shopifyToken + "-" + "count";
    let children;
    let antibotDiv = this.browser.selector("form").find(prefix + shopifyToken);

    if (antibotDiv.length) {
      children = antibotDiv.children();
      children.first().remove();
      children.last().remove();

      const val = String(antibotDiv.children().length);
      antibotDiv.append(
        `<input type="text" name="${antibotInputName}" value=${val} />`
      );
      this.log(`Antibot on ${url}`);
      this.log(`${antibotDiv?.html() ?? "no-html"}`);
    }
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

  async getPaymentSession(): Promise<string> {
    const { paymentCard } = this.task.profile!;
    this.log("Getting the payment token.");
    return await this.post(
      // "https://elb.deposit.shopifycs.com/sessions",
      "https://deposit.us.shopifycs.com/sessions",
      {
        credit_card: {
          month: Number(paymentCard.expirationMonth),
          name: paymentCard.cardHolder,
          number: this.cardNumberFormatted(),
          verification_value: paymentCard.verificationNumber,
          year: paymentCard.expirationYear,
        },
      },
      {
        headers: {
          "content-type": "application/json",
        },
      }
    ).then((res) => res.data.id);
  }

  async checkStatus(): Promise<any> {
    this.updateStatus(CheckingStatus);
    const b = this.browser;
    const success = b.selector("[data-step='thank_you']");

    if (success.html()) {
      this.notifyCheckout(true);
      this.updateStatus(CheckedOut, MessageType.Good);
      return TaskStep.Complete;
    }
    const pageNotice = b
      .selector(".notice")
      .not(".hidden")
      .children("div")
      .text()
      ?.toLocaleLowerCase();
    if (!pageNotice) {
      this.log("Immediately refreshing the page for status");
      return await b.goTo(b.getUrl());
    }
    this.log(pageNotice);

    if (pageNotice.includes("declined")) {
      this.notifyCheckout(false);

      return this.error("Declined");
    } else if (
      pageNotice.includes("stock") ||
      pageNotice.includes("unavailable")
    ) {
      this.returnToATC = true;
      const product = await this.requestProduct();

      if (this.setAnotherVariant(product)) {
        await this.removeProduct();
        return;
      }
      return this.waitOnStock();
    } else if (
      pageNotice.includes("incorrect") ||
      pageNotice.includes("invalid cc")
    ) {
      this.notifyCheckout(false);

      this.log("Invalid card number", MessageType.Error);

      return this.error(Declined);
    } else if (pageNotice.includes("expired")) {
      this.notifyCheckout(false);

      return this.error("Card Expired");
    } else if (pageNotice.includes("already been purchased")) {
      this.notifyCheckout(true);
      this.updateStatus(CheckedOut, MessageType.Good);
      return TaskStep.Complete;
    } else if (
      pageNotice.includes("postal code do not match") ||
      pageNotice === "No Match"
    ) {
      return this.error(BillingAddressError);
    } else if (/technical reason/i.test(pageNotice)) {
      this.updateStatus(
        this.task.proxy
          ? `Payment Failed: Proxy Protection`
          : "Payment Failed: Technical Issue | Anti-Bot"
      );
    } else if (pageNotice.includes("maximum number of declines")) {
      this.notifyCheckout(false);

      return this.error(Declined);
    } else if (/[issue processing]/i.test(pageNotice)) {
      this.updateStatus("Payment processing issues", MessageType.Warning);
      return this.error(pageNotice);
    }
    this.updateStatus(pageNotice, MessageType.Warning);
    this.paymentSession = undefined;
    return b.refresh();
  }

  async submitPayment(): Promise<any> {
    const b = this.browser;

    if (this.isPreloading) {
      this.log("Calculating taxes in preload");
    } else {
      if (this.isSoldOut()) {
        this.updateStatus("[Sold Out]Calculating Taxes");
      } else {
        this.updateStatus("Calculating Taxes");
      }
    }

    if (this.isSoldOut()) {
      this.returnToATC = true;
      return await b.refresh();
    }

    if (!b.selector("[data-gateway-name]")?.attr("data-select-gateway")) {
      this.log(`Waiting for the CC form to appear.`);
      return await b.refresh().then(() => this.submitPayment());
    } else {
      this.updateStatus(SubmittingBilling);
    }

    const paymentToken =
      this.paymentSession ||
      (await this.getPaymentSession().catch((e) => {
        this.log("Failed to get payment token", MessageType.Warning);
        this.log(String(e));
      }));
    if (!paymentToken) {
      this.log("There isn't a payment token.");
      return await this.submitPayment();
    }

    b.input("s", paymentToken);

    b.input("checkout[attributes][I-agree-to-the-Terms-and-Conditions]", "Yes");

    await b.submitForm(`.edit_checkout:has(input[name='previous_step'])`);
  }

  //   didDoBadStuff: boolean = false;
  async submitShippingRate() {
    if (!this.isPreloading) {
      this.updateStatus(SubmittingRate);
    } else {
      this.log(SubmittingRate);
      this.log("This is during the preload...");
    }
    const b = this.browser;

    const rate = cheerio(b.selector("[data-shipping-method]")[0]).attr(
      "data-shipping-method"
    );
    const html = b.html();

    if (/be shipped to/gm.test(html)) {
      if (this.isPreloading) {
        this.returnToATC = true;
        return this.removeProduct();
      }
      this.log(
        `This item doesn't ship to this profile's country (${this.task.profile.address.country.name}) `,
        MessageType.Error
      );
      return this.error("Shipping Not Available");
    }

    if (!rate) {
      this.log("Refreshing page");
      return await b.refresh();
    }
    this.log(`Got rate: ${rate}`);

    await b.submitForm(`.edit_checkout:has(input[name='previous_step'])`);
  }

  async submitAddress() {
    const b = this.browser;

    if (!this.isPreloading) {
      this.updateStatus("Entering Shipping");
    } else {
      this.log("Submitting the address in the preload");
    }
    const address = this.task.profile!.address;
    const names = address.name.split(" ");
    const lastName = names[names.length - 1];

    const province =
      address.country.code === "CA"
        ? provinces.find((s) => s.abbreviation === address.stateProvinceRegion)
            ?.name
        : states.find((s) => s.abbreviation === address.stateProvinceRegion)
            ?.name;
    const country = address.country.code;

    if (country !== "CA") {
      b.input("checkout[shipping_address][region]", "");
    }

    // OK GO
    b.input("checkout[email]", address.email);
    b.input("checkout[email_or_phone]", address.email);
    b.input("checkout[shipping_address][first_name]", names[0]);
    b.input("checkout[shipping_address][last_name]", lastName);
    b.input("checkout[shipping_address][address1]", address.lineOne);
    b.input("checkout[shipping_address][address2]", address.lineTwo || "");
    b.input("checkout[shipping_address][city]", address.cityTownVillage);
    const isUsingFullCountryName = b.selector(`[data-code="${country}"]`).length
      ? true
      : false;
    b.input(
      "checkout[shipping_address][country]",
      isUsingFullCountryName ? address.country.name : country
    );
    const isUsingProvinceAbbreviation = b.selector(
      `[value="${address.stateProvinceRegion}"]`
    )?.length
      ? true
      : false;
    b.input(
      "checkout[shipping_address][province]",
      isUsingProvinceAbbreviation
        ? address.stateProvinceRegion
        : province || address.stateProvinceRegion
    );

    b.input("checkout[shipping_address][zip]", address.zipPostal);
    b.input(
      "checkout[shipping_address][phone]",
      address.telephoneNumber
        .replaceAll(" ", "")
        .replaceAll("-", "")
        .replaceAll("(", "")
        .replaceAll(")", "")
    );
    b.input("checkout[attributes][I-agree-to-the-Terms-and-Conditions]", "Yes");

    // writeFile("checkout", b.html());

    await b.submitForm(`.edit_checkout:has(input[name='previous_step'])`);
  }

  async error(what: string) {
    this.updateStatus(what, MessageType.Error);
    this.shutdown();
  }

  async step_checkout({
    next,
    error,
    isFromRetry,
    previousStep,
    setContext,
    context,
  }: StepHandlerParams) {
    if (this.returnToATC) {
      this.returnToATC = false;
      return next(
        this.isPreloading ? TaskStep.PreloadingATC : TaskStep.AddingToCart
      );
    }
    this.log("back to checkout");

    if (!this.isPreloading && !context && !this.lastCheckoutStep) {
      this.updateStatus("Creating Checkout");
    } else if (this.isPreloading) {
      this.log("Creating the checkout for the preload");
    }
    let url = new URL(this.browser.getUrl());

    if (context) {
      const url = context;
      this.log(`Checkout context: ${url}`);
      setContext(undefined);

      await this.browser.goTo(url);
    } else if (isFromRetry) {
      this.log(`From retry, url: ${url.toString()}`);
      this.log(`Furthest is ${this.lastCheckoutStep ?? "_"}`);

      const html = this.browser.html();

      if (html.includes("?no_cookies_from_redirect=1")) {
        this.jar.removeAllCookiesSync();
        this.log("No cookies fix");

        await this.browser.goTo(`/cart/${this.variantID}:1`);
      } else if (
        !url.toString().includes("/checkout") &&
        !url.toString().includes("/throttle") &&
        !url.toString().includes("/checkpoint")
      ) {
        const toGoTo = this.checkoutUrl ?? "/checkout";
        this.log(`Checkout error, will go to ${toGoTo}  `);
        await this.browser.goTo(toGoTo);
      } else {
        this.log(`Refreshing page`);
        await this.browser.refresh();
      }
    } else if (!url.toString().includes("/checkout")) {
      await this.browser.goTo(this.checkoutUrl ?? "/checkout");
    }

    if (this.returnToATC) {
      this.returnToATC = false;
      return next(
        this.isPreloading ? TaskStep.PreloadingATC : TaskStep.AddingToCart
      );
    }

    url = new URL(this.browser.getUrl());
    const str = url.toString();

    if (str.includes("/cart")) {
      this.updateStatus(`Checkout Create Failure`, MessageType.Warning);

      this.log(this.browser.html());
      if (this.variantID) {
        await this.browser.goTo(`/cart/${this.variantID}:1`);
      } else {
        return next(previousStep);
      }
    }

    this.log(`Final url: ${str}`);

    return next();
  }

  async step_goToSite({ next, retry }: StepHandlerParams) {
    const browser = this.browser;

    if (!browser.getUrl().includes("/password")) {
      this.updateStatus(LoadingSite);
    }

    await browser.goTo("/password");
    const { storePassword } = this.task.group;

    if (browser.getUrl().includes("/password")) {
      this.updateStatus(InWaitingRoom);
      if (storePassword) {
        browser.input("password", storePassword);
        await browser.submitForm("[action^='/password']");
        if (!browser.getUrl().endsWith("/password")) {
          return next();
        }
      }

      return retry(this.task.group.retryDelay);
    } else {
      return next();
    }

    // const { storePassword } = this.request;

    // return await this.navigateTo("/password").then(async (page) => {
    //   const url = page.url;
    //   if (storePassword) {
    //     const passForm = page.document("[action='/password']");
    //     page.setDocValueAll("password", storePassword);

    //     return await this.post(
    //       passForm.attr("action") || "/password",
    //       passForm.serialize(),
    //       {
    //         maxRedirects: 0,
    //       }
    //     )
    //       .then(() => retry(this.task.group.retryDelay))
    //       .catch((e) => {
    //         const nextLocation =
    //           String(e.response?.headers["location"]) || e.request?.path;
    //         const code = e.request?.res?.statusCode;

    //         if (!nextLocation.includes("/password") && code !== 429) {
    //           this.log(`[Password] ${this.requestURL.concat(url)} loaded`);

    //           return next();
    //         }
    //         this.updateStatus(`Check Store Password`, Severity.Warning);
    //         return retry(this.task.group.retryDelay);
    //       });
    //   }

    //   if (url.includes("/password")) {
    //     this.updateStatus(InWaitingRoom);
    //     return retry(this.task.group.retryDelay);
    //   }
    //   this.log(`${this.requestURL.concat(url)} loaded`);
    //   const apiToken = page
    //     .document("[name='shopify-checkout-api-token']")
    //     .attr("content");
    //   if (apiToken) {
    //     this.checkoutApiToken = apiToken;
    //   }
    //   return next();
    // });
  }

  async askProductQuestion() {
    // const hasQAnswer = this.product!.productForm!.properties?.answer;
    // const product = this.product!;
    // if (hasQAnswer) {
    //   const challengeResponse: QuestionResponse =
    //     await this.requestChallengeResponse({
    //       url: product.url,
    //       where: ShopifyQuestion,
    //       version: Question,
    //       question: `Enter the answer for ${product.url}`,
    //       siteKey: "",
    //     });
    //   product.productForm!.properties.answer = challengeResponse.answer;
    // }
  }

  async waitOnStock() {
    // may be dumb, but we will always remove the product if we're waiting on a restock.
    await this.removeProduct();

    // this would clear our variant id from the previous setAnotherVariant call
    this.attemptedVariantIDs.clear();

    const product = await this.requestProduct();
    this.setAnotherVariant(product, true);
  }

  async step_addToCart(params: StepHandlerParams): Promise<TaskStep> {
    const { next, retry, setContext } = params;
    this.updateStatus(AddToCart);

    const p = await this.requestProduct();

    const v = p.variants.find((v) => v.id === this.variantID)!;

    this.log(`Adding ${p.title} variant: ${v.id} size ${v.size}`);
    // productPage isn't set when we use a variant id.
    const productForm: any = { ...p.productForm };

    const origUrl = this.requestURL.endsWith("/")
      ? this.requestURL.substr(0, this.requestURL.length - 1)
      : this.requestURL;
    let headers: any = {
      origin: origUrl,
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      referer: p.url,
    };
    const variant = p.variants.find((v) => v.id === this.variantID)!;

    productForm.id = this.variantID;
    if (productForm["option-0"]) {
      productForm["option-0"] = variant.size;
    }
    if (productForm["Size"]) {
      productForm["Size"] = variant.size;
    }
    if (productForm["option-Size"]) {
      productForm["option-Size"] = variant.size;
    }
    if (productForm["option-size"]) {
      productForm["option-size"] = variant.size;
    }
    if (productForm["_id"]) {
      productForm["_id"] = this.variantID;
    }
    if (productForm["_quantity"]) {
      productForm["_quantity"] = 1;
    }
    if (!productForm["form_type"]) {
      productForm["form_type"] = "product";
    }
    if (!productForm["utf8"]) {
      productForm["utf8"] = "✓";
    }
    // sometimes we just get a blank good for nothing form...
    if (!productForm.quantity) {
      productForm.quantity = 1;
    }
    this.updateTask((t) => (t.product = undefined));
    this.log(JSON.stringify(productForm, null, "\t"));

    // this.log(`${JSON.stringify(productForm)}`);
    // this.log(qs.stringify(productForm));

    return await this.post(`/cart/add.js`, qs.stringify(productForm), {
      headers: headers,
    })
      .then(async (r: any) => {
        this.setDetails(p, variant);

        console.timeEnd("ATC");

        if (this.checkoutUrl) {
          let url = normalizeUrl(
            this.checkoutUrl.replace("stock_problems", "")
          );

          const itemPrice = r.data.price ? r.data.price / 100 : 0;
          const preloadedPrice = Number(this.preloadedVariant?.price || 0);

          this.log(
            `Prices: ${itemPrice} vs ${preloadedPrice} (what we preloaded)`
          );

          setContext(url);
        }
        return next();
      })
      .catch(async (err) => {
        if (!err.response) {
          return retry(this.task.group.retryDelay);
        }
        const { data } = err.response;
        const status = data?.status;
        const description = data?.description as string | undefined;

        if (status === 429 || status === 503) {
          this.log(
            String(data || "No data for this error."),
            MessageType.Error
          );
        }

        if (status === 429) {
          this.updateStatus("Throttled: 429", MessageType.Warning);
          return retry(this.task.group.retryDelay);
        }
        if (description && /\bsold out\b/i.test(description)) {
          if (!this.setAnotherVariant(p)) {
            return this.waitOnStock().then(() => retry(0));
          }
          return retry(this.task.group.retryDelay);
        }
        return retry(this.task.group.retryDelay);
      });
  }

  async step_selectVariant({ next, retry }: StepHandlerParams) {
    const product = await this.requestProduct();

    this.log("Selecting a variant...");

    if (this.variantID) {
      this.log(`One already selected. ${this.variantID}`);
      return next();
    }

    const variant = getRandomAvailableVariant(product, this.task.sizes);
    this.log(`Got: ${variant?.id || "nothing"}`);

    if (variant) {
      this.variantID = String(variant.id);
    } else {
      this.log("None of the sizes we want are in stock.");
      this.updateStatus("Size(s) not in stock", MessageType.Warning);

      return retry(0);
    }

    return next();
  }

  removeAllExceptSelectorFromHtml(selector: string) {
    return removeAllExceptSelectorFromHtml(this.browser.html(), selector);
  }

  async step_login({
    next,
    error,
    retry,
  }: StepHandlerParams): Promise<TaskStep> {
    const account = this.task.account;
    if (!account) {
      this.log("No account, skipping login");

      return next();
    }

    return await this.navigateTo("/account/login").then(async (page) => {
      this.updateStatus(LoggingIn);
      page.setDocValue("customer[email]", account.email);
      page.setDocValue("customer[password]", account.password);

      const loginForm = page.document(`[action='/account/login']`);

      let v3TokenInput = loginForm.children("input[name=recaptcha-v3-token]");

      if (!v3TokenInput.length) {
        v3TokenInput = loginForm.append(
          "<input name='recaptcha-v3-token' hidden />"
        );
      }

      this.updateStatus("V3 Login Captcha Requested", MessageType.Warning);

      const v3Answer =
        await this.requestChallengeResponse<RecaptchaChallengeResponse>({
          siteKey: "6LcCR2cUAAAAANS1Gpq_mDIJ2pQuJphsSQaUEuc9",
          action: "customer_login",

          userAgent: this.userAgent,
          url: this.requestURL.concat("/account/login"),
          version: RecaptchaV3Score,
          where: ShopifyLogin,
          html: this.createRecaptchaV3Html(
            "6LcCR2cUAAAAANS1Gpq_mDIJ2pQuJphsSQaUEuc9"
          ),
        });

      page.setDocValueAll("recaptcha-v3-token", v3Answer.token);
      return await this.post(
        `/account/login`,
        page.document("[action='/account/login']").serialize(),
        {
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          maxRedirects: 0,
        }
      )
        .then(() => retry(this.task.group.retryDelay))
        .catch(async (e) => {
          const location = e.response.headers["location"] as string;
          const code = e.request?.res?.statusCode;

          if (code === 403) {
            this.updateStatus("V3 Captcha failed", MessageType.Warning);
            return retry(this.task.group.retryDelay);
          }

          if (!location) {
            this.log(String(e));
            return retry(this.task.group.retryDelay);
          }

          if (location?.includes("/challenge")) {
            const page = await this.navigateTo(location);

            this.updateStatus("Waiting On Login Captcha", MessageType.Warning);
            const recaptchaResponse =
              await this.requestChallengeResponse<RecaptchaChallengeResponse>({
                url: page.url,
                where: ShopifyLogin,
                version: RecaptchaV2,
                html: page.html,
                siteKey: "",
              });

            page.setDocValue("g-recaptcha-response", recaptchaResponse.token);
            return await this.post(
              "/account/login",
              page
                .document("[action*='account/login']:not(#customer_login)")
                .serialize() +
                "&" +
                encodeURI(
                  "g-recaptcha-response=" + recaptchaResponse.token + ""
                ),
              {
                headers: {
                  origin: this.requestURL,
                  referer: this.reqURLTrailing + "challenge",
                  "content-type": "application/x-www-form-urlencoded",
                },
                maxRedirects: 0,
              }
            )
              .then(() => retry(this.task.group.retryDelay))
              .catch((e) => {
                const nextLocation = String(e.response?.headers["location"]);
                if (nextLocation.endsWith("/account")) {
                  return next();
                }
                return retry(this.task.group.retryDelay);
              });
          } else if (location?.includes("/account/login")) {
            return error(FailedToLogIn);
          }

          return next();
        });
    });
  }
}
