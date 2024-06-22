import { JobExecutor } from "@core/job/JobExecutor";
import { StepHandlerParams } from "@core/job/StepHandlerParams";
import { TaskStep } from "@core/job/TaskStep";
import { TaskPage } from "@core/task-page";
import {
  keywordMatches,
  keywords,
  negativeKeywords,
  proxyForAgent,
} from "@core/util/helpers";
import { MessageType } from "@entities/MessageType";
import { MonitorTask } from "@entities/MonitorTask";
import { Product } from "@entities/Product";
import { TaskLog } from "@entities/Task";
import { QueueFinish } from "@queueit/QueueFinish";
import { QueueFinishRequest } from "@queueit/QueueFinishRequest";
import { QueueItUser } from "@queueit/QueueItUser";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import axiosCookieJarSupport from "axios-cookiejar-support";
import createHttpsProxyAgent from "https-proxy-agent";
import { TypedEmitter } from "tiny-typed-emitter";
import { Cookie, CookieJar } from "tough-cookie";
import { MonitorWorkerEvents } from "./MonitorWorkerEvents";

export abstract class MonitorWorker extends TypedEmitter<MonitorWorkerEvents> {
  http: AxiosInstance;
  jar: CookieJar;
  requestURL: string;

  jobExecutor: JobExecutor;

  isShutdown: boolean = false;
  ignoreServerErrors: boolean = true;

  task: MonitorTask;

  activeQueueUser?: QueueItUser;
  activeQueueFinish?: QueueFinish;
  previousMessage?: TaskLog;

  private _userAgent: string =
    "Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Mobile Safari/537.3";

  constructor(task: MonitorTask) {
    super();
    this.task = task;
    const http = (this.http = axios.create());

    const storeUrl = task.group.store.url;

    this.requestURL = storeUrl;

    this.http.defaults.baseURL = this.requestURL;

    this.jar = new CookieJar();
    axiosCookieJarSupport(this.http);

    http.defaults.jar = this.jar;
    http.defaults.withCredentials = true;
    http.defaults.headers["User-Agent"] = this.userAgent;
    this.setProxy();

    this.jobExecutor = new JobExecutor(this.task.group.retryDelay, {
      delayModifier: (delay) => this.modifyDelay(delay),
    });

    this.jobExecutor.on("stepThrewError", (e) => {
      console.log(e?.message);
    });

    this.jobExecutor.on("finishedWithError", (message) => {
      console.log("Finished with error");
      this.updateStatus(message, MessageType.Error);
    });

    this.http.interceptors.request.use(
      (c) => c,
      (e) => {
        // console.log(e);
        Promise.reject(e);
      }
    );

    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        const code = error.request?.res?.statusCode;
        // console.log(error);
        // proxy auth failure
        if (code === 407) {
          this.updateStatus("Could not log in to proxy", MessageType.Error);
          this.rotateProxy();
        } else if (
          error.code === "ERR_SOCKET_CLOSED" ||
          error.code === "ECONNRESET"
        ) {
          this.updateStatus("Connection closed/dropped", MessageType.Warning);
        } else if (code) {
          this.updateStatus(`Got error code ${code}`, MessageType.Error);
        } else if (error.message?.includes("timeout of")) {
          this.updateStatus(`Connection Timed Out`, MessageType.Error);
        }
        return Promise.reject(error);
      }
    );
  }

  protected addStep(
    step: TaskStep,
    handler: (params: StepHandlerParams) => Promise<TaskStep>
  ) {
    this.jobExecutor.addStep(step, handler);
  }

  protected keywords(): string[] {
    return keywords(this.task.monitor);
  }

  get userAgent() {
    return this._userAgent;
  }

  protected setUserAgent(userAgent: string) {
    this._userAgent = userAgent;
    this.http.defaults.headers["User-Agent"] = this.userAgent;
  }

  async get(
    resource: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse> {
    return this.http.get(resource, config).catch((error) => {
      if (this.shouldRetryHttpRequest(error)) {
        return this.get(resource, config);
      }
      throw error;
    });
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

  public updateStatus(status: string, type: MessageType = MessageType.Info) {
    if (
      this.task.message?.message !== status ||
      this.task.message?.type !== type
    ) {
      this.previousMessage = {
        message: status,
        type: type,
      };
      this.updateTask((t) => {
        t.message = {
          message: status,
          type: type,
        };
      });
    }
  }
  sendQueueUser(url: string) {
    this.emit("queueitPassed", this, url);
  }

  queueFinishFulfilled(user?: QueueFinish) {
    this.emit("queueitFulfilled", user);
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
        console.log(`Queue-It User Fulfilled`);
        console.log(JSON.stringify(p, null, 4));

        resolve(p);
      });
    });

    this.emit("queueitUserRequest", this, triggerUrl);
    return p;
  }

  protected async requestQueueFinish(req: QueueFinishRequest) {
    const p = new Promise<QueueFinish | undefined>((resolve) => {
      this.once("queueitFulfilled", (p) => {
        resolve(p);
      });
    });

    this.emit("queueitRequest", this, req);
    return p;
  }

  protected updateTask(updateFunction: (task: MonitorTask) => void) {
    updateFunction(this.task);
    this.emit("taskShouldUpdate", this);
  }

  shouldRetryHttpRequest(error: any) {
    const { code } = error;
    const responseCode = error.request?.res?.statusCode;
    if (code === "ERR_SOCKET_CLOSED") {
      return true;
    }
    return (
      error?.message?.includes("timeout") ||
      code === "ECONNABORTED" ||
      responseCode == 430 ||
      (this.ignoreServerErrors && responseCode >= 500)
    );
  }

  protected negativeKeywords(): string[] {
    return negativeKeywords(this.task.monitor);
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
  public shutdown() {
    this.isShutdown = true;
    this.emit("shutdown", this);
  }

  async navigateTo(
    path: string,
    config?: AxiosRequestConfig
  ): Promise<TaskPage> {
    return this.http
      .get(path, config)
      .then((r) => [r.data, r.request?.path])
      .then(
        ([data, path]) => new TaskPage(path || this.requestURL + path, data)
      );
  }

  protected productStockUpdate(product: Product) {
    this.emit("productUpdate", this, this.requestURL, product);

    this.updateStatus("Found");
    this.updateTask(
      (t) =>
        (t.product = {
          product: product,
          variant: product.variants[0],
        })
    );
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
  }

  public textMatchesMonitor(monitor: string) {
    return keywordMatches(monitor, this.keywords(), this.negativeKeywords());
  }

  public sizeMatchesMine(other: string) {
    if (!this.task.sizes || !other || !this.task.sizes.length) {
      return true;
    }
    other = other.toLowerCase().trim();

    const otherSizeNum = Number(other);
    for (let size of this.task.sizes) {
      const mysizeNum = Number(size);
      if (!isNaN(mysizeNum) && !isNaN(otherSizeNum)) {
        return otherSizeNum === mysizeNum;
      }
      if (size.toLocaleLowerCase().trim() === other) {
        return true;
      }
      let sizeRegex: RegExp;

      try {
        sizeRegex = new RegExp(size, "i");
      } catch (e) {
        sizeRegex = new RegExp("", "i");
      }

      if (sizeRegex.test(other)) {
        return true;
      }
    }
    return false;
  }

  onRequestUpdated() {
    if (this.task.group.timeout) {
      this.http.defaults.timeout = this.task.group.timeout * 1000;
    }

    this.setProxy();
  }

  protected modifyDelay(delay: number): number {
    return delay;
  }

  protected async _setup() {
    //
  }

  public async monitor() {
    await this._setup();
    return new Promise(async (resolve) => {
      this.once("shutdown", async () => resolve(false));
      return resolve(await this.jobExecutor.workOnCurrentStep());
    });
  }
}
