import { ChallengeRequest, ChallengeResponse } from "@core/challenge/Challenge";
import { StepHandlerParams } from "@core/job/StepHandlerParams";
import {
  getRandomAvailableVariant,
  keywords,
  negativeKeywords,
  proxyForAgent,
  proxyToString,
} from "@core/util/helpers";
import { BuyerTask } from "@entities/BuyerTask";
import { QueueFinish } from "@queueit/QueueFinish";
import { QueueFinishRequest } from "@queueit/QueueFinishRequest";
import { QueueItUser } from "@queueit/QueueItUser";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import axiosCookieJarSupport from "axios-cookiejar-support";
import createHttpsProxyAgent from "https-proxy-agent";
import { TypedEmitter } from "tiny-typed-emitter";
import { Cookie, CookieJar, MemoryCookieStore, Store } from "tough-cookie";
import { MessageType } from "../../core/entities/MessageType";
import { Product, ProductVariant } from "../../core/entities/Product";
import { JobExecutor } from "../../core/job/JobExecutor";
import { TaskStep } from "../../core/job/TaskStep";
import { TaskPage } from "../../core/task-page";
import { BuyerWorkerEvents } from "./BuyerWorkerEvents";
import {
  CaptchaReceivedSignal,
  ConnectionIssuesSignal,
  ThrottleSignal,
} from "./task-signals";
import { ProxyAuthFailure } from "./task-status";

import UserAgent from "user-agents";

type TaskRequestConfig = AxiosRequestConfig & {
  requestTimeout?: number;
};

export abstract class BuyerWorker extends TypedEmitter<BuyerWorkerEvents> {
  reqURLTrailing: string;
  isShutdown: boolean = false;

  jobExecutor: JobExecutor;
  forceIgnoreAvailability?: boolean;

  httpRetryAttempts: number = 0;

  previousStatus: string = "";
  previousSeverity: MessageType = MessageType.Info;
  jar: CookieJar;

  protected reportUnknownErrors: boolean = true;
  ignoreServerErrors: boolean = true;

  variantID?: string;
  attemptedVariantIDs = new Set<string>();

  protected http: AxiosInstance;
  private _userAgent: string;
  hideTimedOut?: boolean = false;
  hideRetry: boolean = true;
  cookieStore: Store;
  task: BuyerTask;

  activeQueueUser?: QueueItUser;
  activeQueueFinish?: QueueFinish;

  get requestURL() {
    return this.task.group.store.url;
  }

  constructor(task: BuyerTask) {
    super();
    this.task = task;

    this.cookieStore = new MemoryCookieStore();
    this.jar = new CookieJar(this.cookieStore, {
      looseMode: true,
    });

    this.jobExecutor = new JobExecutor(this.task.group.retryDelay, {
      delayModifier: (delay, e) => this.modifyDelay(delay, e),
    });

    this.jobExecutor.on("willStartStep", async (retryCount) => {
      this.httpRetryAttempts = 0;

      this.updateSignal("");

      const { currentStepIdx } = this.jobExecutor;
      if (retryCount > 0 && currentStepIdx === 0) {
        this.jar.removeAllCookiesSync();
        await this.rotateProxy();
      }
    });

    this.jobExecutor.on("willRetryStep", (retryCount) => {
      if (!this.hideRetry) {
        this.updateSignal(`Retrying (${retryCount})`);
      }
    });

    this.jobExecutor.on("stepThrewError", (e) => {
      // console.error(e);
      this.log(e?.message);
      // console.log("It threw an error");
    });

    this.jobExecutor.on("finishedWithError", (message) => {
      this.log("Finished with error");
      this.updateStatus(message, MessageType.Error);
    });

    this.http = axios.create({
      baseURL: this.requestURL,
      timeout: this.task.group.timeout * 1000,
      jar: this.jar,
      withCredentials: true,
    });

    const ua = new UserAgent();
    this.setUserAgent((this._userAgent = ua.toString()));

    this.setProxy();

    axiosCookieJarSupport(this.http);
    this.reqURLTrailing = this.requestURL.endsWith("/")
      ? this.requestURL
      : this.requestURL + "/";

    this.http.interceptors.response.use(
      (response) => response,
      async (error) => {
        const code = error.request?.res?.statusCode;
        if (code === 407) {
          this.updateStatus(ProxyAuthFailure);
          await this.rotateProxy();
        }
        if (code && code !== 302) {
          this.log(`Received Error code ${code}`, MessageType.Warning);
        } else if (
          error.message?.includes("timeout of") ||
          error.message?.includes("ETIMEDOUT")
        ) {
          if (!this.hideTimedOut) {
            this.updateSignal("Timed Out");
          }
          this.log(`Current timeout: ${this.task.group.timeout}`);
        } else if (!code && this.reportUnknownErrors) {
          this.log(`Received HTTP Error ${error.message}`, MessageType.Error);
        }
        return Promise.reject(error);
      }
    );
  }

  protected async addStep(
    step: TaskStep,
    handler: (params: StepHandlerParams) => Promise<TaskStep>
  ) {
    this.jobExecutor.addStep(step, handler);
  }

  public log(message: string, severity: MessageType = MessageType.Info) {
    if (this.isShutdown) {
      return;
    }
    this.emit("logUpdate", this, message, severity);
  }

  productFulfilled(product: Product) {
    this.emit("productFulfilled", product);
  }

  /**
   *
   * @returns A product that has at least one of my criteria in stock.
   */
  protected async requestProduct(): Promise<Product> {
    const p = new Promise<Product>((resolve) => {
      this.once("productFulfilled", (p) => {
        resolve(p);
      });
    });
    this.emit("productRequest", this);
    return p;
  }

  sendQueueUser(url: string) {
    this.emit("queueitPassed", this, url);
  }

  queueFinishFulfilled(complete?: QueueFinish) {
    this.emit("queueitFulfilled", complete);
  }

  queueUserFulfilled(user?: QueueItUser) {
    if (user && user.cookies) {
      for (let cookie of user.cookies) {
        const c = Cookie.fromJSON(cookie);
        if (c) {
          this.jar.setCookieSync(c, this.requestURL);
        }
      }
    }
    this.emit("queueitUserFulfilled", user);
  }

  protected async requestQueueitUser(triggerUrl: string) {
    const p = new Promise<QueueItUser | undefined>((resolve) => {
      this.once("queueitUserFulfilled", (p) => {
        this.log(`Queue-It User Fulfilled`);
        this.log(JSON.stringify(p, null, 4));

        resolve(p);
      });
    });

    this.emit("queueitUserRequest", this, triggerUrl);
    return p;
  }

  protected async requestQueueFinish(request: QueueFinishRequest) {
    const p = new Promise<QueueFinish | undefined>((resolve) => {
      this.once("queueitFulfilled", (p) => {
        this.log(`Queue-It Fulfilled`);
        this.log(JSON.stringify(p, null, 4));

        resolve(p);
      });
    });

    this.emit("queueitRequest", this, request);
    return p;
  }

  public async shutdown(status?: string): Promise<any> {
    if (this.isShutdown) {
      return;
    }
    this.isShutdown = true;

    this.emit("shutdown", this);
    if (status) {
      this.updateStatus(status);
    }
    this.jobExecutor.shutdown();
    this._shutdown();
    this.removeAllListeners();
  }

  public setProxy() {
    const proxy = this.task.proxy;
    if (proxy) {
      const agent = createHttpsProxyAgent(proxyForAgent(proxy));

      this.http.defaults.httpAgent = agent;
      this.http.defaults.httpsAgent = agent;
    } else {
      this.http.defaults.httpAgent = this.http.defaults.httpsAgent = undefined;
    }
    this.log(`Proxy is ${proxy ? proxyToString(proxy) : "localhost"}`);
  }

  updateSignal(msg: string) {
    if (this.task.signal != msg) {
      this.updateTask((t) => {
        t.signal = msg;
      });
    }

    if (msg) {
      this.log(msg);
    }
  }

  onRequestUpdated() {
    if (this.task.group.timeout) {
      this.http.defaults.timeout = this.task.group.timeout * 1000;
    }
    this.jobExecutor.retryingDelay = this.task.group.retryDelay;

    this.setProxy();
    this._onRequestUpdated();
  }

  protected _onRequestUpdated() {
    //
  }

  shouldRetryHttpRequest(error: any) {
    if (this.httpRetryAttempts === 3) {
      this.updateSignal(ThrottleSignal);
    }
    const { code } = error;
    const responseCode = error.request?.res?.statusCode;
    // this.log(`ShouldRetry: ${code}, ${error?.message || "no message"}`);
    if (error?.message === "requestTimeout") {
      return false;
    }
    if (code === "ERR_SOCKET_CLOSED") {
      this.updateSignal(ConnectionIssuesSignal);
      return true;
    }
    if (
      this.hideTimedOut &&
      (error?.message?.includes("timeout") || code === "ECONNABORTED")
    ) {
      return false;
    }

    return (
      error?.message?.includes("timeout") ||
      code === "ECONNABORTED" ||
      responseCode == 430 ||
      (this.ignoreServerErrors && responseCode >= 500)
    );
  }

  async post(
    resource: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse> {
    return this.http.post(resource, data, config).catch((error) => {
      if (this.shouldRetryHttpRequest(error)) {
        return this.post(resource, data, config);
      }
      throw error;
    });
  }
  async delete(
    resource: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse> {
    return this.http.delete(resource, config).catch((error) => {
      if (this.shouldRetryHttpRequest(error)) {
        return this.delete(resource, config);
      }
      throw error;
    });
  }

  async put(
    resource: string,
    data?: any,
    config?: TaskRequestConfig
  ): Promise<AxiosResponse> {
    if (config?.requestTimeout) {
      const source = axios.CancelToken.source();

      const timeout = setTimeout(() => {
        source.cancel("requestTimeout");
      }, config.requestTimeout);
      return this.http
        .put(resource, data, {
          ...config,
          cancelToken: source.token,
        })
        .then((r) => {
          clearTimeout(timeout);
          return r;
        })
        .catch((error) => {
          if (this.shouldRetryHttpRequest(error)) {
            return this.put(resource, config);
          }
          throw error;
        });
    }
    return this.http.put(resource, data, config).catch((error) => {
      if (this.shouldRetryHttpRequest(error)) {
        return this.put(resource, data, config);
      }
      throw error;
    });
  }

  async get(
    resource: string,
    config?: TaskRequestConfig
  ): Promise<AxiosResponse> {
    if (config?.requestTimeout) {
      const source = axios.CancelToken.source();

      const timeout = setTimeout(() => {
        source.cancel("requestTimeout");
      }, config.requestTimeout);
      return this.http
        .get(resource, {
          ...config,
          cancelToken: source.token,
        })
        .then((r) => {
          clearTimeout(timeout);
          return r;
        })
        .catch((error) => {
          if (this.shouldRetryHttpRequest(error)) {
            return this.get(resource, config);
          }
          throw error;
        });
    } else {
      return this.http.get(resource, config).catch((error) => {
        if (this.shouldRetryHttpRequest(error)) {
          return this.get(resource, config);
        }
        throw error;
      });
    }
  }

  async patch(
    resource: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse> {
    return this.http.patch(resource, data, config).catch((error) => {
      if (this.shouldRetryHttpRequest(error)) {
        return this.patch(resource, data, config);
      }
      throw error;
    });
  }

  async rotateProxy() {
    const p = new Promise((resolve) => {
      this.once("proxyRotateCompleted", () => {
        this.setProxy();
        resolve({});
      });
    });
    this.emit("proxyRotateRequest", this);
    return p;
  }

  protected setUserAgent(userAgent: string) {
    this._userAgent = userAgent;
    this.http.defaults.headers["User-Agent"] = this.userAgent;
  }

  updateStatus(status: string, type: MessageType = MessageType.Info) {
    if (this.isShutdown) {
      return;
    }

    if (
      this.task.message?.message !== status ||
      this.task.message?.type !== type
    ) {
      this.previousStatus = status;
      this.previousSeverity = type;
      this.log(status, type);
      this.updateTask((t) => {
        t.message = {
          message: status,
          type: type,
        };
      });
    }
  }

  protected updateTask(updateFunction: (task: BuyerTask) => void) {
    updateFunction(this.task);
    this.emit("taskShouldUpdate", this);
  }

  protected createRecaptchaV3Html(siteKey: string) {
    return `
    <html>
    
    
    <head>
    
      <title>Recaptcha V3 Invisible</title>
     <script src="https://www.google.com/recaptcha/api.js?render=${siteKey}&onload=v3Callback"></script>

    </head>
    
    
    <body>
    
     
    </body>


    </html>
    `;
  }

  protected async requestChallengeResponse<T extends ChallengeResponse>(
    request: Omit<ChallengeRequest, "id">
  ): Promise<T> {
    const p = new Promise<T>((resolve) => {
      let shutdownListener = async () => {
        this.emit("cancelChallenge", this);
      };
      let retryListener = async () => {
        this.removeListener("shutdown", shutdownListener);
        this.removeListener("retryChallengeRequest", retryListener);

        resolve(this.requestChallengeResponse(request));
      };

      this.once("shutdown", shutdownListener);
      this.once("retryChallengeRequest", retryListener);
      this.once("challengeCompleted", async (answer: ChallengeResponse) => {
        this.updateStatus(this.previousStatus, this.previousSeverity);
        this.updateSignal(CaptchaReceivedSignal);
        const x =
          typeof answer === "object" ? { ...answer } : { answer: answer };
        if ((x as any).html) {
          delete (x as any).html;
        }
        this.log(JSON.stringify(x, null, 4));
        resolve(answer as T);
      });
    });
    const cookies = await this.jar.getCookies(this.requestURL);
    this.log(
      `Requesting challenge from ${request.url} version: ${request.version} | where: ${request.where}`
    );
    if (!request.url.includes("://")) {
      request.url = request.url.startsWith("/")
        ? this.requestURL.concat(request.url)
        : this.requestURL.concat("/").concat(request.url);
    }

    this.emit("challengeRequest", this, {
      ...request,
      id: this.task.id,
      cookies: !request.cookies ? cookies : request.cookies,
    });

    return p;
  }

  get userAgent() {
    return this._userAgent;
  }

  protected hostName() {
    const url = new URL(this.requestURL);
    if (url) {
      return url.hostname;
    }
    return this.requestURL;
  }

  public async goToWork() {
    this.log(`User agent is ${this.userAgent}`);
    this.log(
      `Proxy is ${
        this.task.proxy ? proxyToString(this.task.proxy) : "localhost"
      }`
    );

    await this._setup();
    return new Promise(async (resolve) => {
      this.once("shutdown", async () => resolve(false));
      return resolve(await this.jobExecutor.workOnCurrentStep());
    });
  }

  async navigateTo(path: string): Promise<TaskPage> {
    return this.http
      .get(path)
      .then((r) => [r.data, r.request?.path])
      .then(
        ([data, path]) =>
          new TaskPage(path || this.requestURL.concat(path), data)
      )
      .catch((axr) => {
        throw axr;
      });
  }

  // helper methods

  protected isFlagSet(flag: number) {
    return (this.task.flags & flag) !== 0;
  }

  notifyCheckout(success: boolean) {
    this.emit("checkoutComplete", this, success);
  }

  protected cardNumberFormatted() {
    const cardNumber = this.task.profile!.paymentCard.cardNumber;
    return cardNumber.replace(/(.{4})/g, "$1 ").trim();
  }

  protected expirationYearShorthand() {
    const expirationYear = this.task.profile!.paymentCard.expirationYear;
    return expirationYear.substring(2);
  }

  protected keywords(): string[] {
    return keywords(this.task.monitor);
  }

  getRandomUnusedVariant(p: Product) {
    const x = {
      ...p,
      variants: p.variants.filter((v) => !this.attemptedVariantIDs.has(v.id)),
    } as Product;

    const v = getRandomAvailableVariant(
      x,
      this.task.sizes,
      this.forceIgnoreAvailability
    );
    if (!v) {
      this.attemptedVariantIDs.clear();
      this.log("Clearing every size that we tried.");
    }
    return (
      v ||
      getRandomAvailableVariant(
        p,
        this.task.sizes,
        this.forceIgnoreAvailability
      )
    );
  }

  setAnotherVariant(product: Product, allowRetry: boolean = false): boolean {
    this.attemptedVariantIDs.add(this.variantID!);

    const ugh = product.variants
      .filter((v) => this.attemptedVariantIDs.has(v.id))
      .map((v) => `${v.size} (${v.id})`)
      .join(", ");

    this.log(`Switching sizes. We've tried ${ugh}`);
    this.log(`${this.attemptedVariantIDs.size} | ${product.variants.length}`);

    const next = this.getRandomUnusedVariant(product);

    if (!next) {
      this.log(
        `We don't have any other sizes to try, and it didn't reset? Maybe another variant didn't match our size which is ${
          this.task.sizes || "?"
        }`,
        MessageType.Error
      );
      return false;
    }
    this.log(`Switching to: ${next.size} (${next.id})`);

    // We just tried this one, the monitor doesn't know it's OOS yet
    if (next.id === this.variantID && !allowRetry) {
      this.log("We just tried this variant.");
      return false;
    }

    this.updateStatus(`Changed size to ${next.size}`);

    this.variantID = next.id;

    return true;
  }

  protected negativeKeywords(): string[] {
    return negativeKeywords(this.task.monitor);
  }

  setDetails(product: Product, variant: ProductVariant) {
    this.updateTask(
      (task) =>
        (task.product = {
          product: product!,
          variant: variant,
        })
    );
  }

  protected modifyDelay(delay: number, error?: Error): number {
    return delay;
  }

  protected abstract _shutdown(): Promise<any>;
  protected abstract _setup(): Promise<any>;
}
