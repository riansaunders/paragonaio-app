import { BrowserPage } from "@core/browser/BrowserPage";
import { StepHandlerParams } from "@core/job/StepHandlerParams";
import { ShopifyShippingRate } from "@core/shopify/entities/ShopifyShippingRate";
import { getRandomAvailableVariant } from "@core/util/helpers";
import { BuyerTask } from "@entities/BuyerTask";
import cheerio from "cheerio";
import { next } from "cheerio/lib/api/traversing";
import qs from "qs";
import {
  RecaptchaChallengeResponse,
  RecaptchaV2Checkbox,
  RecaptchaV3Score,
  ShopifyLogin,
} from "../../core/challenge/Challenge";
import { MessageType } from "../../core/entities/MessageType";
import { TaskStep } from "../../core/job/TaskStep";
import { ShopifyAPICheckout } from "../../core/shopify/entities/ShopifyCheckout";
import { TaskPage } from "../../core/task-page";
import { states } from "../../core/util/locales";
import { BuyerWorker } from "../worker/BuyerWorker";
import {
  AddToCart,
  BillingAddressError,
  CalculatingTaxes,
  CheckedOut,
  CheckingStatus,
  Declined,
  FailedToLogIn,
  GettingShippingRate,
  LoggingIn,
  SubmittingBilling,
  TooManyRequests,
} from "../worker/task-status";

export default class ShopifyFast extends BuyerWorker {
  checkoutApiToken?: string;
  shopifyCheckout?: ShopifyAPICheckout;
  rates?: ShopifyShippingRate[];
  addressDetails: any;
  paymentSession?: string;

  preparedBrowserDetails?: any;
  addedToCart: boolean = false;
  browser: BrowserPage;

  constructor(task: BuyerTask) {
    super(task);
    this.browser = new BrowserPage(this.requestURL, this.http, this.userAgent);
  }

  protected _setup(): Promise<any> {
    this.log("Fast Mode Enabled");

    this.http.interceptors.response.use(
      (response) => response,
      async (error) => {
        const code = error.request?.res?.statusCode;

        if (code === 429) {
          this.updateStatus(TooManyRequests);
          this.log("BP May be on");
          await this.rotateProxy();
        }
        return Promise.reject(error);
      }
    );

    this.http.interceptors.request.use((request) => {
      if (request.url?.includes("/wallets/") && this.checkoutApiToken) {
        const cookies = this.jar.getCookiesSync(this.requestURL);

        request.headers["authorization"] = `Basic ${Buffer.from(
          this.checkoutApiToken
        ).toString("base64")}`;

        request.headers["x-shopify-checkout-version"] = "2018-03-05";
        (request.headers["x-shopify-visittoken"] = cookies.find(
          (c) => c.key === "_shopify_s"
        )?.value),
          (request.headers["x-shopify-uniquetoken"] = cookies.find(
            (c) => c.key === "_shopify_y"
          )?.value),
          (request.headers["x-shopify-checkout-authorization-token"] =
            this.checkoutApiToken);
        request.headers["x-shopify-wallets-caller"] = "costanza";
      }

      return request;
    });

    this.browser.setSyncEventHandler({
      didNavigate: async (previousUrl) => {
        const browser = this.browser;
        const url = browser.getUrl();
        this.log(`Browser navigated to ${url}`);

        // if (url.includes("/throttle")) {
        //   this.http.defaults.timeout = 8 * 1000;
        //   this.log(`Timeout set because of queue to 8s`);
        // } else {
        //   // reset every where else.
        //   this.http.defaults.timeout = this.task.group.timeout * 1000;
        //   this.log(`Timeout reset to ${this.http.defaults.timeout}`);
        // }

        if (url.includes("/throttle")) {
          this.updateStatus("In Queue");
          // writeFile("queue", browser.html());
          if (!url.includes("?no_js=true")) {
            return await this.browser.goTo("/throttle/queue?no_js=true");
          } else {
            return await new Promise<any>((resolve) => {
              setTimeout(async () => {
                resolve(await this.browser.refresh());
              }, 1000);
            });
          }
        } else if (url.includes("/account/login")) {
          this.updateStatus(`Account Required`, MessageType.Error);
          this.shutdown();
          return;
        } else if (url.includes("/checkouts/") && !this.shopifyCheckout) {
          if (!this.checkoutApiToken) {
            const apiToken = browser
              .selector("[name='shopify-checkout-api-token']")
              .attr("content");
            this.checkoutApiToken ||= apiToken;
            this.log(`The api token is ${apiToken}`);
          }

          const checkoutStr = "/checkouts/";
          let shopifyToken = url
            .substr(url.indexOf(checkoutStr) + checkoutStr.length)
            .split("?")[0];
          this.log(`Shopify token is ${shopifyToken}`);

          try {
            await this.patchCheckout(
              {
                checkout: {
                  presentment_currency: "USD",
                  shipping_address: this.addressDetails,
                  billing_address: this.addressDetails,

                  email: address.email,
                  ...(this.task.shippingRate
                    ? {
                        shipping_rate: {
                          id: this.task.shippingRate,
                        },
                      }
                    : {}),
                },
              },
              shopifyToken
            );
          } catch (e: any) {
            this.log(String(e));
          }
        } else if (url.includes("/checkpoint")) {
          this.updateStatus(
            "Checkpoint detected, not supported",
            MessageType.Error
          );
          this.shutdown();
          return;
        }
      },
      willSubmitForm: (url, _, value) => {
        //
      },
    });

    const address = this.task.profile!.address;
    const names = address.name.split(" ");
    const lastName = names[names.length - 1];

    const province = states.find(
      (s) => s.abbreviation === address.stateProvinceRegion
    )?.name;

    this.addressDetails = {
      first_name: names[0],
      last_name: lastName,
      phone: address.telephoneNumber,
      company: null,
      address1: address.lineOne,
      address2: address.lineTwo || "",

      city: address.cityTownVillage,
      province: province || "",
      province_code: address.stateProvinceRegion || "",
      country: address.country.name,
      country_code: address.country.code,
      zip: address.zipPostal,
    };

    this.preparedBrowserDetails = qs.stringify({
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
    });

    this.addStep(TaskStep.DebugA, (params) => {
      // console.time("checkout");
      return params.next();
    });

    this.addStep(TaskStep.PreloadPaymentSession, async (params) => {
      this.getPaymentSession()
        .then((r) => (this.paymentSession = r))
        .catch((e) => {
          //
        });
      return params.next();
    });

    this.addStep(TaskStep.LoggingIn, (params) => this.step_login(params));

    this.addStep(TaskStep.SelectVariant, (params) =>
      this.step_selectVariant(params)
    );
    this.addStep(TaskStep.AddingToCart, (params) =>
      this.step_addToCart(params)
    );
    this.addStep(TaskStep.GetCheckout, async (params) => {
      this.updateStatus("Creating Checkout");
      // i was in the queue, i timed out whatever.
      if (this.browser.getUrl().includes("/throttle")) {
        await this.browser.refresh();
      } else {
        await this.browser.goTo("/checkout");
      }
      if (!this.shopifyCheckout) {
        const product = await this.requestProduct();
        if (!this.setAnotherVariant(product, true)) {
          return this.waitOnStockAndThenATC(params);
        }
        await this.removeProduct();
        return params.next(TaskStep.AddingToCart);
      }

      return params.next();
    });

    if (!this.task.shippingRate) {
      this.addStep(TaskStep.GettingShippingRates, (params) =>
        this.step_retrieveShippingRates(params)
      );
      this.addStep(TaskStep.SubmittingShippingRate, (params) =>
        this.step_submitShippingRate(params)
      );
    }

    this.addStep(TaskStep.CheckingOut, (params) =>
      this.step_submitPayment(params)
    );
    this.addStep(TaskStep.DebugB, (params) => {
      // console.timeEnd("checkout");
      return params.next();
    });

    this.addStep(TaskStep.CheckingOrderStatus, (params) =>
      this.step_checkStatus(params)
    );

    return Promise.resolve();
  }

  removeAllExceptSelectorFromHtml(selector: string) {
    const document = cheerio.load(this.browser.html());
    const checkpoint = document(selector);

    const bad = "cdn.shopify.com";
    document("body")
      .children()
      .each((_, c) => {
        const el = cheerio(c);
        const href = el.attr("href") || "";
        const src = el.attr("src") || "";
        if (
          !el.is("script") ||
          src.includes(bad) ||
          src.includes("klaviyo") ||
          src.includes("zendesk") ||
          src.includes("shopify/") ||
          src.includes("zdassets") ||
          src.includes("myshopify.com") ||
          src.includes("usercentrics") ||
          el.attr("dns-prefetch") ||
          el.attr("name") === "commit" ||
          (el.is("script") && el.html()?.toLowerCase().includes("asyncload")) ||
          (el.is("script") && el.hasClass("analytics"))
        ) {
          el.remove();
        }
      });
    document("head")
      .children()
      .each((_, c) => {
        const el = cheerio(c);
        const href = el.attr("href") || "";
        const src = el.attr("src") || "";
        if (
          href.includes(bad) ||
          src.includes(bad) ||
          src.includes("storefront.min.js") ||
          src.includes("klaviyo") ||
          src.includes("zendesk") ||
          src.includes("shopify/") ||
          src.includes("zdassets") ||
          src.includes("myshopify.com") ||
          src.includes("usercentrics") ||
          el.attr("dns-prefetch") ||
          (el.is("script") && el.html()?.toLowerCase().includes("asyncload")) ||
          (el.is("script") && el.hasClass("analytics"))
        ) {
          el.remove();
        }
      });

    document("body").append(checkpoint);

    return document.html();
  }

  async getPaymentSession(): Promise<string> {
    const { paymentCard } = this.task.profile!;
    this.log("Getting the payment token.");
    return await this.post(
      this.shopifyCheckout?.payment_url ||
        "https://elb.deposit.shopifycs.com/sessions",
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

  getCheckoutForm(page: TaskPage) {
    return page
      .document(".edit_checkout:has(input[name='previous_step'])")
      .serialize();
  }

  async removeProduct() {
    await this.patchCheckout({
      checkout: {
        line_items: [],
      },
    }).then(() => this.log("We removed the product from our cart"));
  }

  isSoldOut(page: TaskPage) {
    return page.url.includes("stock_problems") ||
      page.document(".product__status--sold-out").text()
      ? true
      : false;
  }

  async step_checkStatus(params: StepHandlerParams): Promise<TaskStep> {
    this.updateStatus(CheckingStatus);
    return await this.navigateTo(this.shopifyCheckout!.processing_url).then(
      async (page) => {
        const { next, retry, error, previousStep } = params;
        const product = await this.requestProduct();
        if (!page) {
          this.log("Status page didn't return anything", MessageType.Warning);
          return retry(this.task.group.retryDelay);
        }
        if (this.isSoldOut(page)) {
          if (this.setAnotherVariant(product)) {
            await this.removeProduct();
            return next(TaskStep.AddingToCart);
          }
          return this.waitOnStockAndThenATC(params);
        }
        const { document } = page;
        const success = document("[data-step='thank_you']");

        if (success.html()) {
          this.notifyCheckout(true);
          this.updateStatus(CheckedOut, MessageType.Good);
          return TaskStep.Complete;
        }
        const pageNotice = document(".notice")
          .not(".hidden")
          .children("div")
          .text()
          ?.toLocaleLowerCase();
        if (!pageNotice) {
          this.log("Immediately refreshing the page for status");
          return retry(0);
        }
        this.log(pageNotice);

        if (pageNotice.includes("declined")) {
          this.notifyCheckout(false);
          this.updateStatus(Declined, MessageType.Error);

          return error(Declined);
        } else if (
          pageNotice.includes("stock") ||
          pageNotice.includes("unavailable")
        ) {
          if (this.setAnotherVariant(product)) {
            await this.removeProduct();
            return next(TaskStep.AddingToCart);
          }
          return this.waitOnStockAndThenATC(params);
        } else if (
          pageNotice.includes("incorrect") ||
          pageNotice.includes("invalid cc")
        ) {
          this.notifyCheckout(false);

          this.log("Invalid card number", MessageType.Error);
          return error(Declined);
        } else if (pageNotice.includes("expired")) {
          this.notifyCheckout(false);

          this.updateStatus(Declined);
          return error(Declined);
        } else if (pageNotice.includes("already been purchased")) {
          this.notifyCheckout(true);
          this.updateStatus(CheckedOut, MessageType.Good);
          return TaskStep.Complete;
        } else if (
          pageNotice.includes("postal code do not match") ||
          pageNotice === "No Match"
        ) {
          return error(BillingAddressError);
        } else if (pageNotice.includes("maximum number of declines")) {
          this.notifyCheckout(false);

          return error(Declined);
        }
        // this.updateStatus(RetryingCheckout);
        this.updateStatus(pageNotice, MessageType.Warning);
        return next(previousStep!, this.task.group.retryDelay);
      }
    );
  }

  async step_submitPayment(params: StepHandlerParams): Promise<TaskStep> {
    this.updateStatus(SubmittingBilling);
    return await this.navigateTo(this.shopifyCheckout!.web_url).then(
      async (page) => {
        const { next, retry, error } = params;

        if (!page) {
          return retry(this.task.group.retryDelay);
        }

        if (this.isSoldOut(page)) {
          this.log("Sold out on the checkout page.", MessageType.Error);
          const product = await this.requestProduct();

          if (this.setAnotherVariant(product)) {
            await this.removeProduct();
            return next(TaskStep.AddingToCart);
          }
          return this.waitOnStockAndThenATC(params);
        }
        if (
          !page.document("[data-gateway-name]")?.attr("data-select-gateway")
        ) {
          this.log(`Waiting for the CC form to appear. Retrying in 1s.`);
          return retry(0);

          // return retry(200);
        }

        const paymentToken =
          this.paymentSession ??
          (await this.getPaymentSession().catch((e) => {
            this.log("Failed to get payment token", MessageType.Warning);
            console.log(e);
          }));
        if (!paymentToken) {
          this.log("There isn't a payment token.");
          return retry(this.task.group.retryDelay);
        }
        page.setDocValue("s", paymentToken);

        page.setDocValue(
          "checkout[attributes][I-agree-to-the-Terms-and-Conditions]",
          "Yes"
        );

        const data = qs.parse(this.getCheckoutForm(page)) as any;
        if (
          page.document(
            "[name='checkout[attributes][I-agree-to-the-Terms-and-Conditions]']"
          ).length
        ) {
          if (!data.checkout.attributes) {
            data.checkout.attributes = {};
          }
          data.checkout.attributes["I-agree-to-the-Terms-and-Conditions"] =
            "Yes";
        }
        if (data.checkout.remember_me) {
          data.checkout.remember_me = false;
        }
        data.checkout.payment_gateway =
          page
            .document("[data-gateway-name='credit_card']")
            .attr("data-select-gateway") || data.checkout.payment_gateway;

        const { address, billingAddress } = this.task.profile;

        const supportsDiffBilling = page.document(
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

        data.checkout.different_billing_address =
          billingAddress && supportsDiffBilling ? true : false;

        if (data.checkout.different_billing_address) {
          if (!data.checkout.billing_address) {
            data.checkout.billing_address = {};
          }
          const addy = billingAddress ?? address;
          const names = addy.name.split(" ");
          const lastName = names[names.length - 1];

          data.checkout.billing_address.first_name = names[0];
          data.checkout.billing_address.last_name = lastName;
          data.checkout.billing_address["address1"] = addy.lineOne;
          data.checkout.billing_address["address2"] = addy.lineTwo || "";
          data.checkout.billing_address["city"] = addy.cityTownVillage;
          data.checkout.billing_address["country"] = addy.country.name;
          data.checkout.billing_address["province"] = addy.stateProvinceRegion;
          data.checkout.billing_address["zip"] = addy.zipPostal;
          data.checkout.billing_address["phone"] = addy.telephoneNumber;
        } else {
          delete data.checkout.billing_address;
        }

        delete data.hosted_fields_redirect;

        return await this.post(
          page.url.split("?")[0],
          qs.stringify(data, {
            arrayFormat: "repeat",
          }) +
            "&" +
            this.preparedBrowserDetails,
          {
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              origin: this.requestURL,
              referer: this.requestURL + page.url,
            },
            maxRedirects: 0,
          }
        )
          .then((e) => {
            this.log(
              "Our checkout returned something strange? Big log incoming."
            );
            this.log(String(e?.data || "No data"));
            return retry(this.task.group.retryDelay);
          })
          .catch(async (e) => {
            const nextLocation = String(e.response?.headers["location"]);
            this.log(`Next location: ${nextLocation || "None"}`);
            this.paymentSession = undefined;

            if (nextLocation.includes("/processing")) {
              return next();
            }
            return retry(this.task.group.retryDelay);
          });
      }
    );
  }

  async step_submitShippingRate({ next }: StepHandlerParams) {
    return await this.patchCheckout({
      checkout: {
        shipping_rate: {
          id: this.rates![0].id,
        },
      },
    }).then(() => next());
  }

  async waitOnStock() {
    // may be dumb, but we will always remove the product if we're waiting on a restock.
    await this.removeProduct();

    // this would clear our variant id from the previous setAnotherVariant call
    this.attemptedVariantIDs.clear();

    const product = await this.requestProduct();
    this.setAnotherVariant(product, true);
  }

  async step_selectVariant({ next, error, retry }: StepHandlerParams) {
    this.log("Selecting a variant...");
    const product = await this.requestProduct();
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

  async patchCheckout(data: any, token?: string) {
    token ??= this.shopifyCheckout?.token;
    return this.patch(`/wallets/checkouts/${token}.json`, data).then(
      (response) => {
        return (this.shopifyCheckout = response.data.checkout);
      }
    );
  }

  async hasItemInCart(): Promise<boolean> {
    return await this.get("/cart.js")
      .then((r) => r.data)
      .then((d) => d.items.length);
  }

  async waitOnStockAndThenATC({ next }: StepHandlerParams) {
    // may be dumb, but we will always remove the product if we're waiting on a restock.
    await this.removeProduct();

    // this would clear our variant id from the previous setAnotherVariant call
    this.attemptedVariantIDs.clear();
    const product = await this.requestProduct();
    this.setAnotherVariant(product, true);

    return next(TaskStep.AddingToCart);
  }

  async step_addToCart(params: StepHandlerParams): Promise<TaskStep> {
    const { next, retry } = params;

    this.updateStatus(AddToCart);
    const product = await this.requestProduct();

    const variant = product.variants.find((v) => v.id === this.variantID)!;
    this.updateTask((t) => (t.product = undefined));

    // use the SAFE method
    if (!this.shopifyCheckout) {
      this.log("ATC with no checkout");
      const productForm: any = { ...product.productForm };

      const origUrl = this.requestURL.endsWith("/")
        ? this.requestURL.substr(0, this.requestURL.length - 1)
        : this.requestURL;
      let headers: any = {
        origin: origUrl,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        referer: product.url,
      };

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

      // this.log(`${JSON.stringify(productForm)}`);
      // this.log(qs.stringify(productForm));

      return await this.post(`/cart/add.js`, qs.stringify(productForm), {
        headers: headers,
      })
        .then(async (r: any) => {
          this.setDetails(product, variant);

          // console.timeEnd("ATC");

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
            if (!this.setAnotherVariant(product)) {
              return this.waitOnStock().then(() => retry(0));
            }
            return retry(this.task.group.retryDelay);
          }
          return retry(this.task.group.retryDelay);
        });
    }
    this.log("ATC with existing checkout");

    return await this.patchCheckout({
      checkout: {
        line_items: [
          {
            variant_id: Number(this.variantID),
            quantity: 1,
          },
        ],
        shipping_address: this.addressDetails,
      },
    })
      .then(() => {
        this.setDetails(product, variant);

        return next(TaskStep.CheckingOut);
      })
      .catch((err) => {
        console.log(err);
        if (!err.response) {
          return retry(this.task.group.retryDelay);
        }

        const { data } = err.response;
        const status = data?.status;

        const responseCode = err.request?.res?.statusCode;

        if (status === 422 || responseCode === 422) {
          if (!this.setAnotherVariant(product)) {
            return this.waitOnStockAndThenATC(params);
          }
        }
        return retry(this.task.group.retryDelay);
      });
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

          if (location.includes("/challenge")) {
            const page = await this.navigateTo(location);

            this.updateStatus("Solve login captcha", MessageType.Warning);
            const recaptchaResponse =
              await this.requestChallengeResponse<RecaptchaChallengeResponse>({
                url: this.requestURL + page.url,
                where: ShopifyLogin,
                siteKey: "",
                version: RecaptchaV2Checkbox,
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
          } else if (location.includes("/account/login")) {
            return error(FailedToLogIn);
          }
          return next();
        });
    });
  }

  async getShopifyCheckout(token?: string): Promise<ShopifyAPICheckout> {
    return this.get(
      `/wallets/checkouts/${token || this.shopifyCheckout!.token}.json`
    ).then((d) => (this.shopifyCheckout = d.data.checkout));
  }

  async step_retrieveShippingRates({
    next,
    retry,
    isFromRetry,
  }: StepHandlerParams) {
    this.updateStatus(GettingShippingRate);
    return await this.getShippingRates().then((rates) => {
      if (!rates || !rates.length) {
        this.log("No shipping rates. Will retry in 1s", MessageType.Warning);
        return retry(200);
      } else {
        this.rates = rates;
        return next();
      }
    });
  }

  protected _shutdown(): Promise<any> {
    return Promise.resolve();
  }

  async step_calculateTaxes({ next }: StepHandlerParams) {
    this.updateStatus(CalculatingTaxes);
    return await this.post(
      `/wallets/checkouts/${
        this.shopifyCheckout!.token
      }/calculate_shipping.json`,
      {
        checkout: {
          shipping_address: this.addressDetails,
        },
      }
    ).then((d) => {
      this.shopifyCheckout = d.data.checkout;

      return next();
    });
  }

  async getShippingRates(): Promise<ShopifyShippingRate[] | null> {
    return await this.get(
      `/wallets/checkouts/${this.shopifyCheckout!.token}/shipping_rates.json`
    )
      .then((r) => r.data.shipping_rates)
      .catch((e) => console.log(e));
  }
}
