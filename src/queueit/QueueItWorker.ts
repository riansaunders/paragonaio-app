import {
  ChallengeRequest,
  ChallengeResponse,
  QueueItChallenge,
  RecaptchaChallengeResponse,
  RecaptchaV2Invisible,
} from "@core/challenge/Challenge";
import { proxyForAgent } from "@core/util/helpers";
import { MessageType } from "@entities/MessageType";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import createHttpsProxyAgent from "https-proxy-agent";
import { TypedEmitter } from "tiny-typed-emitter";
import UAParser from "ua-parser-js";
import { v1, v4 } from "uuid";
import { ChallengeVerification } from "./ChallengeVerification";
import { ProofOfWorkChallenge } from "./ProofOfWorkChallenge";
import { QueueDetails } from "./QueueDetails";
import { QueueItConfig } from "./QueueItConfig";
import { QueueItWorkerEvents as QueueItWorkerEvents } from "./QueueItWorkerEvents";
import { QueueStatus } from "./QueueStatus";

export const queueItCaptchaHtmlVisible = `<!DOCTYPE html>
<html class="no-js supports-no-cookies" lang="en">

<head>

    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">

    <title>Solve this</title>
</head>

<body>


    <div class="recaptcha__wrapper" style="overflow: hidden">
        <script>
            //<![CDATA[
            var onCaptchaSuccess = function () {
                var event;

                try {
                    event = new Event('captchaSuccess', {
                        bubbles: true,
                        cancelable: true
                    });
                } catch (e) {
                    event = document.createEvent('Event');
                    event.initEvent('captchaSuccess', true, true);
                }

                window.dispatchEvent(event);
            }

            //]]>
        </script>
        <script>
            //<![CDATA[
            var recaptchaCallback = function () {
                grecaptcha.render('g-recaptcha', {
                  // invisible
                    // sitekey: "6LePTyoUAAAAADPttQg1At44EFCygqxZYzgleaKp",


                    // visible
                    sitekey: "6Lc9sScUAAAAALTk003eM2ytnYGGKQaQa7usPKwo",


                    callback: 'onCaptchaSuccess',

                    // visible
                    size: (window.innerWidth > 320) ? 'normal' : 'compact',

                    //invisible
                    // size: "invisible",
                });
                grecaptcha.execute();
            };

            //]]>
        </script>
        <script
            src="https://www.recaptcha.net/recaptcha/api.js?onload=recaptchaCallback&amp;render=6LePTyoUAAAAADPttQg1At44EFCygqxZYzgleaKp&amp;hl=en"
            async="async">
            //<![CDATA[

            //]]>
        </script>
        <noscript>
            <div class="g-recaptcha-nojs"><iframe class="g-recaptcha-nojs__iframe" frameborder="0" scrolling="no"
                    src="https://www.google.com/recaptcha/api/fallback?k=6LePTyoUAAAAADPttQg1At44EFCygqxZYzgleaKp"></iframe>
                <div class="g-recaptcha-nojs__input-wrapper"><textarea id="g-recaptcha-response"
                        name="g-recaptcha-response" class="g-recaptcha-nojs__input">
              </textarea></div>
            </div>
        </noscript>
        <div id="g-recaptcha" class="g-recaptcha"></div>
    </div>
</body>

</html>`;

export const queueItCaptchaHtmlInvisible = `<!DOCTYPE html>
<html class="no-js supports-no-cookies" lang="en">

<head>

    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">

    <title>Solve this</title>
</head>

<body>


    <div class="recaptcha__wrapper" style="overflow: hidden">
        <script>
            //<![CDATA[
            var onCaptchaSuccess = function () {
                var event;

                try {
                    event = new Event('captchaSuccess', {
                        bubbles: true,
                        cancelable: true
                    });
                } catch (e) {
                    event = document.createEvent('Event');
                    event.initEvent('captchaSuccess', true, true);
                }

                window.dispatchEvent(event);
            }

            //]]>
        </script>
        <script>
            //<![CDATA[
            var recaptchaCallback = function () {
                grecaptcha.render('g-recaptcha', {
                  // invisible
                    sitekey: "6LePTyoUAAAAADPttQg1At44EFCygqxZYzgleaKp",


                    // visible
                    // sitekey: "6Lc9sScUAAAAALTk003eM2ytnYGGKQaQa7usPKwo",


                    callback: 'onCaptchaSuccess',

                    // visible
                    // size: (window.innerWidth > 320) ? 'normal' : 'compact',

                    //invisible
                    size: "invisible",
                });
                grecaptcha.execute();
            };

            //]]>
        </script>
        <script
            src="https://www.recaptcha.net/recaptcha/api.js?onload=recaptchaCallback&amp;render=6LePTyoUAAAAADPttQg1At44EFCygqxZYzgleaKp&amp;hl=en"
            async="async">
            //<![CDATA[

            //]]>
        </script>
        <noscript>
            <div class="g-recaptcha-nojs"><iframe class="g-recaptcha-nojs__iframe" frameborder="0" scrolling="no"
                    src="https://www.google.com/recaptcha/api/fallback?k=6LePTyoUAAAAADPttQg1At44EFCygqxZYzgleaKp"></iframe>
                <div class="g-recaptcha-nojs__input-wrapper"><textarea id="g-recaptcha-response"
                        name="g-recaptcha-response" class="g-recaptcha-nojs__input">
              </textarea></div>
            </div>
        </noscript>
        <div id="g-recaptcha" class="g-recaptcha"></div>
    </div>
</body>

</html>`;

const layoutVersionRegex = /\"layoutVersion\":\s?(\d*)/i;
const layoutNameRegex = /\"layoutName\":\s?\"([^\"]*)\"/i;

export function btoaReplacer(nonAsciiChars: string) {
  const fromCharCode = String.fromCharCode;
  // make the UTF string into a binary UTF-8 encoded string
  var point = nonAsciiChars.charCodeAt(0);
  if (point >= 0xd800 && point <= 0xdbff) {
    var nextcode = nonAsciiChars.charCodeAt(1);
    if (nextcode !== nextcode)
      // NaN because string is 1 code point long
      return fromCharCode(
        0xef /*11101111*/,
        0xbf /*10111111*/,
        0xbd /*10111101*/
      );
    // https://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
    if (nextcode >= 0xdc00 && nextcode <= 0xdfff) {
      point = (point - 0xd800) * 0x400 + nextcode - 0xdc00 + 0x10000;
      if (point > 0xffff)
        return fromCharCode(
          (0x1e /*0b11110*/ << 3) | (point >>> 18),
          (0x2 /*0b10*/ << 6) | ((point >>> 12) & 0x3f) /*0b00111111*/,
          (0x2 /*0b10*/ << 6) | ((point >>> 6) & 0x3f) /*0b00111111*/,
          (0x2 /*0b10*/ << 6) | (point & 0x3f) /*0b00111111*/
        );
    } else return fromCharCode(0xef, 0xbf, 0xbd);
  }
  if (point <= 0x007f) return nonAsciiChars;
  else if (point <= 0x07ff) {
    return fromCharCode(
      (0x6 << 5) | (point >>> 6),
      (0x2 << 6) | (point & 0x3f)
    );
  } else
    return fromCharCode(
      (0xe /*0b1110*/ << 4) | (point >>> 12),
      (0x2 /*0b10*/ << 6) | ((point >>> 6) & 0x3f) /*0b00111111*/,
      (0x2 /*0b10*/ << 6) | (point & 0x3f) /*0b00111111*/
    );
}

export function queueitProofOfWorkBase64(json: string, BOMit?: boolean) {
  return Buffer.from(
    (BOMit ? "\xEF\xBB\xBF" : "") +
      json.replace(
        /[\x80-\uD7ff\uDC00-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]?/g,
        btoaReplacer
      )
  ).toString("base64");
}

const presolvedChallenges = new Map<string, any>();

export class QueueItWorker extends TypedEmitter<QueueItWorkerEvents> {
  http: AxiosInstance;

  queueItemToken?: string;

  proofOfWorkSession?: any;
  config: QueueItConfig;

  queueDetails?: QueueDetails;

  isShutdown: boolean = false;

  proofOfWorkChallenge?: ProofOfWorkChallenge;
  recaptchaVerification?: ChallengeVerification;
  proofofWorkVerification?: ChallengeVerification;
  lastStatus?: QueueStatus;
  isFinished: boolean = false;

  proofofWorkRequired: boolean = false;
  recaptchaRequired: boolean = true;
  isInvisible: boolean = true;
  usingOtherSession: boolean = false;

  constructor(config: QueueItConfig) {
    super();
    this.config = config;
    const { baseURL, jar, userAgent, page } = config;
    this.http = axios.create({
      baseURL: baseURL,
      jar: jar,
      withCredentials: true,
      headers: {
        "user-agent": userAgent,
      },
    });
    this.http.defaults.baseURL = baseURL;
    this.http.interceptors.request.use((r) => {
      if (
        r.method === "post" ||
        r.method === "POST" ||
        r.method === "put" ||
        r.method === "PUT"
      ) {
        r.headers["Content-Type"] = "application/json";
        r.headers["x-requested-with"] = "XMLHttpRequest";
      }
      return r;
    });
    this.http.defaults.headers["accept"] = "*/*";

    config.userId =
      page.document("#queue-it_log").attr("data-userid") || config.userId;

    const html = page.html;
    const versionMatch = html.match(layoutVersionRegex);
    if (versionMatch) {
      config.layoutVersion = Number(versionMatch[1]) || config.layoutVersion;
    }
    const layoutMatch = html.match(layoutNameRegex);
    if (layoutMatch) {
      config.layoutName = layoutMatch[1] || config.layoutName;
    }

    if (/challenges:\s?(\[.*\])/gm.test(html)) {
      const exec = /challenges:\s?(\[.*\])/gm.exec(html);
      if (exec && exec.length > 1) {
        const x = JSON.parse(exec[1]);

        for (let challenge of x) {
          const name: string = challenge.name?.toLowerCase();
          console.log("Challenge name:", name, x);

          if (name.includes("recaptcha")) {
            this.isInvisible = name.includes("invisible");
          }

          if (name?.includes("work") || name?.includes("pow")) {
            console.log("POW required");
            this.proofofWorkRequired = true;
          }
        }
      }
    }

    this.setProxy();
  }

  log(what: string) {
    this.emit("log", what);
  }

  updateStatus(what: string, type: MessageType = MessageType.Info) {
    this.emit("statusUpdate", what, type);
  }

  async doWork<T>(fnctn: () => Promise<T>): Promise<T | undefined> {
    if (this.isShutdown) {
      return Promise.resolve(undefined);
    }
    try {
      const res = await fnctn();
      return res;
    } catch (e) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(this.doWork(fnctn)), 8000);
      });
    }
  }

  async get(
    resource: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse> {
    return this.http.get(resource, config);
  }

  async post(
    resource: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse> {
    return this.http.post(resource, data, config);
  }

  async checkStatus(): Promise<QueueStatus> {
    if (!this.queueDetails) {
      throw new Error("No Queue Details");
    }

    const { queueId } = this.queueDetails;
    const { c, e, cid, layoutName, layoutVersion, t } = this.config;

    if (!queueId) {
      this.log("No Queue-Id");
      return {
        redirectUrl: t,
      };
    }

    const isBefore = this.lastStatus
      ? // if we're still before the event start time, we're before.
        Date.now() <
        new Date(
          this.lastStatus.ticket?.eventStartTimeUTC || Date.now()
        ).getTime()
      : true;

    return await this.http
      .post<QueueStatus>(
        `/spa-api/queue/${c}/${e}/${queueId}/status?cid=${encodeURI(
          cid
        )}&l=${encodeURI(layoutName)}&seid=${encodeURI(
          v1()
        )}&sets=${Date.now()}`,
        {
          targetUrl: t,
          customUrlParams: "",
          layoutVersion: layoutVersion,
          layoutName: layoutName,
          isClientRedayToRedirect: isBefore ? null : true,
          isBeforeOrIdle: isBefore,
        },
        this.queueItemToken
          ? {
              headers: {
                "X-Queueit-Queueitem-V1": this.queueItemToken,
              },
            }
          : {}
      )
      .then((r) => {
        this.lastStatus = r.data;
        if (!this.queueItemToken) {
          this.queueItemToken =
            r.headers["X-Queueit-Queueitem-V1"] ||
            r.headers["X-Queueit-Queueitem-V1".toLowerCase()];
          if (this.queueItemToken) {
            this.log("token stored");
            this.log(String(this.queueItemToken));
          }
        }

        const redirect = this.lastStatus?.redirectUrl;
        if (redirect?.startsWith("/")) {
          this.lastStatus.redirectUrl = this.config.baseURL.concat(redirect);
        }

        if (this.lastStatus?.redirectUrl) {
          this.isFinished = true;
          this.log(`Redirect: ${this.lastStatus?.redirectUrl}`);
        }
        const progress = this.lastStatus.ticket?.progress;
        this.emit("progressUpdate", progress ?? 1);

        return this.lastStatus;
      });
  }

  async goToWork(): Promise<QueueStatus | undefined> {
    if (this.isShutdown) {
      return;
    }

    let workCancelled = false;

    // every time it goes to /softblock, it wants another captcha.

    if (this.isInvisible) {
      this.log("Queue-It Invisible");
    }

    if (this.proofofWorkRequired) {
      this.log("POW Required");
    }

    const listener = async (event: string) => {
      // if it's our event and we're not in the queue, do this.
      // if the work wasn't already cancelled as well.
      if (
        event === this.config.e &&
        !this.queueDetails &&
        !workCancelled &&
        !this.usingOtherSession
      ) {
        this.usingOtherSession = true;
        this.log(`Another session started, going to piggy back ${event}`);
        this.emit("cancelChallenge", this);
        workCancelled = true;
        return await this.goToWork();
      }
    };

    if (!this.usingOtherSession) {
      this.once("otherSessionStarted", listener);
    }

    const recapResponse = async () => {
      return await this._doRecaptcha(
        await this.requestChallengeResponse<RecaptchaChallengeResponse>({
          url: this.config.url.toString(),
          version: RecaptchaV2Invisible,
          html: this.isInvisible
            ? queueItCaptchaHtmlInvisible
            : queueItCaptchaHtmlVisible,
          where: QueueItChallenge,
          userAgent: this.config.userAgent,
          siteKey: `6LePTyoUAAAAADPttQg1At44EFCygqxZYzgleaKp`,
        }).then((r) => r.token)
      );
    };
    if (!presolvedChallenges.get(this.config.e) && !workCancelled) {
      await this.doWork(async () => await recapResponse());
    }

    if (this.proofofWorkRequired && !workCancelled) {
      await this.doWork(async () => await this._doProofOfWork());
    }

    this.usingOtherSession = false;

    if (workCancelled) {
      return;
    }
    const details = await this.doWork(async () => await this._enqueue());

    this.log(JSON.stringify(details, null, 4));

    // challenge failed
    if (!details) {
      return await this.goToWork();
    }

    this.removeListener("otherSessionStarted", listener);

    return this._waitInLine();
  }

  async _enqueue(): Promise<QueueDetails | undefined> {
    const { c, e: event, cid, layoutName, t } = this.config;

    let presolved = presolvedChallenges.get(event);

    if (presolved) {
      this.log("Reusing old captcha session");
    }

    if (
      (!this.recaptchaVerification && !presolved) ||
      // if we dont have verification, it's required and we don't have anything presolved, it's an error.
      (!this.proofofWorkVerification && this.proofofWorkRequired && !presolved)
    ) {
      this.log(
        `${
          this.recaptchaVerification ? "recap is good" : "recap is not good"
        } | ${this.proofofWorkVerification ? "pow is good" : "pow is not good"}`
      );
      throw new Error("Challenges not completed");
    }
    this.log(`Will enqueue: ${c} | ${event} | ${cid} | ${layoutName} | ${t}`);

    if (!presolved) {
      presolvedChallenges.set(
        event,
        (presolved = {
          challengeSessions: [this.recaptchaVerification!.sessionInfo].concat(
            this.proofofWorkRequired && this.proofofWorkVerification
              ? this.proofofWorkVerification.sessionInfo
              : []
          ),
          layoutName: layoutName,
          customUrlParams: "",
          targetUrl: t,
          Referrer: "",
        })
      );
      this.log("Cached Presolved");
    }

    const out = presolved;

    return await this.http
      .post<QueueDetails>(
        `/spa-api/queue/${c}/${event}/enqueue?cid=${cid}`,
        out
      )
      .then(async (r) => {
        this.log(`/spa-api/queue/${c}/${event}/enqueue?cid=${cid}`);
        this.log(JSON.stringify(r.data || {}));

        // if (r.data.redirectUrl?.includes("/softblock")) {
        //   this.log("Softblock");
        //   this.recaptchaVerification = undefined;
        //   this.proofofWorkVerification = undefined;
        //   await this.get(r.data.redirectUrl);
        //   presolvedChallenges.delete(event);

        //   return undefined;
        // }

        if (r.data.challengeFailed) {
          this.log("Challenge failed.");
          this.recaptchaVerification = undefined;
          this.proofofWorkVerification = undefined;
          presolvedChallenges.delete(event);

          return undefined;
        }
        this.emit("sessionStarted", event);

        return (this.queueDetails = r.data);
      })
      .catch((e) => {
        presolvedChallenges.delete(event);
        throw e;
      });
  }

  async _waitInLine(): Promise<QueueStatus | undefined> {
    //it's already finished.
    if (this.lastStatus?.redirectUrl || this.isShutdown) {
      return;
    }

    if (!this.queueDetails) {
      throw new Error("Not in the queue");
    }

    try {
      this.log("Waiting in line...");
      const status = await this.checkStatus();

      this.log(`Check again in ${status.updateInterval}`);
      // console.log(`Status`, status);
      return new Promise((resolve) => {
        if (!status.redirectUrl) {
          if (!status.ticket?.progress) {
            this.emit("progressUpdate", 0);
          }

          setTimeout(async () => {
            resolve(await this._waitInLine());
          }, status.updateInterval ?? 5e3);
        } else {
          this.isFinished = true;
          const ul = status.redirectUrl.toLowerCase();
          this.emit("queueComplete", {
            uuid: v4(),
            queueUrl: this.config.url.toString(),
            storeUrl: this.config.task.group.store.url,
            redirectUrl: status.redirectUrl,
            triggerUrl: this.config.triggerUrl,
            blocked: ul.includes("/afterevent.aspx")
              ? false
              : ul.includes("/softblock/"),
          });

          resolve(status);
        }
      });
    } catch (e) {
      return this._waitInLine();
    }
  }

  private async _verify(
    challengeType: "recaptcha-invisible" | "proofofwork" | "recaptcha",
    response: string
  ) {
    this.log("Verifying");
    return await this.http
      .post<ChallengeVerification>("/challengeapi/verify", {
        challengeType: challengeType,
        sessionId: response,
        customerId: this.config.c,
        eventId: this.config.e,
        version: 5,
      })
      .then((r) => r.data);
  }

  async _doRecaptcha(token: string) {
    // demo
    // @ts-ignore
    await this._verify(
      this.isInvisible ? "recaptcha-invisible" : "recaptcha",
      token
    ).then((r) => {
      this.recaptchaVerification = r;
      this.log("Recap Verification");
      this.log(JSON.stringify(this.recaptchaVerification || {}));
      if (!r.isVerified) {
        throw new Error("Not Verified");
      }
    });
  }

  async _doProofOfWork() {
    if (!this.proofOfWorkChallenge) {
      this.proofOfWorkChallenge = await this.http
        .post(`/challengeapi/pow/challenge/${this.config.userId}`)
        .then((r) => r.data)
        .catch((e) => console.error(e));
    }
    if (!this.proofOfWorkSession) {
      const pow = this.proofOfWorkChallenge!;
      const x = new Function(
        "jsSHA",
        `

      const output = ${pow.function}
       
      return output
      `
      )(require("jssha"));

      const tagPrefix = "powTag-";

      const parser = new UAParser(this.config.userAgent);

      const browser = parser.getBrowser();
      const os = parser.getOS();

      const session: any = {
        meta: pow.meta,
        sessionId: pow.sessionId,
        solution: {
          hash: "",
          postfix: 0,
        },
        tags: [
          `${tagPrefix}CustomerId:${this.config.c}`,
          `${tagPrefix}EventId:${this.config.e}`,
          `${tagPrefix}UserId:${this.config.userId}`,
        ],
        stats: {
          duration: Math.ceil(Math.random() * 300),
          tries: 1,
          userAgent: this.config.userAgent,
          // need a random screen resolution
          screen: "2560 x 1440",
          browser: browser.name,
          browserVersion: browser.version || "",
          isMobile: parser.getDevice().type === "mobile",
          os: os.name,
          osVersion: os.version,
          cookiesEnabled: true,
        },
        parameters: pow.parameters,
      };
      // this.log(JSON.stringify(session));
      // this.log(String(func));
      x(session, () => {});
      // this.log("---Aftter---");
      // this.log(JSON.stringify(session));

      this.proofOfWorkSession = session;
    }
    const answer = queueitProofOfWorkBase64(
      JSON.stringify(this.proofOfWorkSession)
    );

    // console.log(answer);

    await this._verify("proofofwork", answer).then((a) => {
      this.proofofWorkVerification = a;
      this.log("POW Verification");
      this.log(JSON.stringify(this.proofofWorkVerification || {}));
    });
  }

  finished() {
    return this.isFinished;
  }

  shutdown() {
    if (!this.isShutdown) {
      this.isShutdown = true;
      this.emit("cancelChallenge", this);
    }
  }

  protected async requestChallengeResponse<T extends ChallengeResponse>(
    req: Omit<ChallengeRequest, "id">
  ): Promise<T> {
    const p = new Promise<T>((resolve) => {
      this.once("challengeFulfilled", (p) => {
        resolve(p as T);
      });
      // this.once("cancelChallenge", () => {
      //   resolve(void)
      // })
    });
    this.emit("challengeRequest", this, {
      id: this.config.task.id,
      ...req,
    });
    return p;
  }

  setProxy() {
    const proxy = this.config.task.proxy;
    if (proxy) {
      const agent = createHttpsProxyAgent(proxyForAgent(proxy));

      this.http.defaults.httpAgent = agent;
      this.http.defaults.httpsAgent = agent;
    } else {
      this.http.defaults.httpAgent = this.http.defaults.httpsAgent = undefined;
    }
  }
}
