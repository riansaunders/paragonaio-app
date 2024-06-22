import {
  ChallengeRequest,
  ChallengeResponse,
  Question,
  RecaptchaV2Checkbox,
  RecaptchaV2Invisible,
  RecaptchaV3Enterprise,
  RecaptchaV3Score,
  WhereChallengeKey,
} from "@core/challenge/Challenge";
import { isProd } from "@core/config";
import { proxyToObject } from "@core/util/helpers";
import { Solver } from "@entities/Solver";
import { BrowserWindow, session } from "electron";
import { TypedEmitter } from "tiny-typed-emitter";
import { proxyMap } from "./solvers";
export interface SolverEvents {
  closed: (profile: Solver) => void;
  challengeRequest: (solver: SolverWindow) => void;
  challengeComplete: (solver: SolverWindow, answer: ChallengeResponse) => void;
}

export class SolverWindow extends TypedEmitter<SolverEvents> {
  solver: Solver;
  challenge?: ChallengeRequest;
  isClosed?: boolean;

  constructor(profile: Solver, taskID?: string, where?: WhereChallengeKey) {
    super();

    this.solver = profile;
  }

  async sendReset() {
    await this._reset();
    this.challenge = undefined;
  }

  close() {
    this.isClosed = true;
    this.challenge = undefined;
    this.emit("closed", this.solver);
    this._close();
  }

  async acceptChallenge(challenge: ChallengeRequest) {
    this.challenge = challenge;

    this._challengeReceived(challenge);
  }

  protected challengeCompleted(answer: ChallengeResponse) {
    this.emit("challengeComplete", this, answer);
  }

  window?: BrowserWindow;

  async open(loadHome: boolean = true): Promise<SolverWindow> {
    if (!this.window) {
      const window = (this.window = new BrowserWindow({
        width: 400,
        height: 600,
        title: "ParagonAIO Solver",
        show: false,
        resizable: !isProd,

        webPreferences: {
          allowRunningInsecureContent: true,
          webSecurity: false,
          nodeIntegration: true,
          contextIsolation: false,
          enableRemoteModule: true,
          session: session.fromPartition("persist:" + this.solver.id),
        },
      }));
      this.updateProxy();

      window.on("page-title-updated", (e) => {
        e.preventDefault();
      });
      window.once("ready-to-show", () => {
        window.show();
      });
      window.once("close", () => {
        this.emit("closed", this.solver);
      });
      this.window?.setTitle(
        `Paragon Solver: ${this.solver.name} | ${this.solver.where || "any"}`
      );
      window.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ["*://*/*"] },
        (details, callback) => {
          if (details.url.includes("/captcha/check")) {
            this.challengeCompleted({
              token: "",
              checkURL: details.url,
            });

            callback({
              cancel: true,
            });
            return;
          } else {
            callback({
              cancel: false,
              requestHeaders: details.requestHeaders,
            });
          }
        }
      );

      if (loadHome) {
        await this.loadHome();
      }
    }
    return Promise.resolve(this);
  }

  private async loadHome() {
    if (isProd) {
      this.window?.loadURL(`file://${__dirname}/index.html#/solver`);
    } else {
      await this.window?.loadURL("http://localhost:9000#solver");
    }
  }

  show() {
    this.window?.show();
  }

  _close() {
    this.window?.removeAllListeners();
    this.window?.close();

    this.window = undefined;
  }

  async openURL(url: string, userAgent?: string) {
    if (!this.window) {
      return Promise.resolve();
    }
    await this.window
      ?.loadURL(
        url,
        userAgent
          ? { userAgent: userAgent }
          : {
              userAgent: this.window?.webContents.userAgent,
            }
      )
      .then(() => this.window?.show());
    return Promise.resolve();
  }

  async updateProxy() {
    const account_session = this.solver;
    const sess = session.fromPartition("persist:" + account_session.id);
    const proxy = account_session.proxy;
    if (proxy?.proxyString) {
      const obj = proxyToObject(proxy);
      const { host, port } = obj;
      sess.setProxy({
        proxyRules: `http://${host}:${port},https://${host}:${port}`,
      });
    } else {
      sess.setProxy({
        proxyRules: undefined,
      });
    }
    proxyMap.set(this.window!.webContents.id, proxy);
  }

  async _challengeReceived(challenge: ChallengeRequest) {
    if (!this.window) {
      return Promise.resolve(true);
    }
    const cookies = session.fromPartition("persist:" + this.solver.id).cookies;

    challenge.cookies?.forEach(async (c) => {
      await cookies
        .set({
          url: challenge.url,

          name: c.key,
          value: c.value,
          secure: c.secure,
          httpOnly: c.httpOnly,
        })
        .catch((e) => {});
    });
    this.window.show();

    const globalCode = `

    const {ipcRenderer} = window.require("electron"); 

    window.sendAnswer = (answer)  => {
      ipcRenderer.invoke("post", {
        resource: "challengeAnswer",
        body: {
          challengeId: "${challenge.id}",
          answer: answer
        }
      }); 
    }
    `;

    const code = `



  function getResponse() {
     const recaptcha = ${
       challenge.version === RecaptchaV2Checkbox ||
       challenge.version === RecaptchaV2Invisible
         ? "true;"
         : "false;"
     }
    const question = ${challenge.version === Question ? "true;" : "false;"}
    
    if(question) {
      const answer = document.querySelector("#answer") || undefined;
      if (answer) {
        sendAnswer(answer);
      }
      return;
    }

      const recapElement = document.querySelector("[name='g-recaptcha-response']") || undefined;
      if (recaptcha) {
        const cv = recapElement?.value || (typeof window?.grecaptcha !== "undefined" ?  grecaptcha?.getResponse() : undefined);
        if (cv) {
          sendAnswer({
            token: cv,
            html: document.documentElement.outerHTML
          }) 
        }
      } else {
        try {
        const dataEl = document.querySelector(
          "[name='hcaptcha_data']"
        );

        const challengeResponseEl = document.querySelector(
          "[name='hcaptcha_challenge_response_token']"
        ); 

        const rv = recapElement?.value;
        const hv = document.querySelector("[name='h-captcha-response']")?.value;
        const token = challengeResponseEl?.value;
        const dataVal = dataEl?.value;


        const hcapframe = document.querySelector('iframe[src*="hcaptcha.com"]');

        if(hcapframe) {
          const theCheck = hcapframe.contentDocument.querySelector(".check")?.style.display !== "none";
          if(theCheck) {
            console.log({
              recaptcha: rv,
              hcaptcha: hv || hcaptcha?.getResponse(),
              token: token,
              data: dataVal,
              html: document.documentElement.outerHTML
            })
            sendAnswer({
              recaptcha: rv,
              hcaptcha: hv || hcaptcha?.getResponse(),
              token: token,
              data: dataVal,
              html: document.documentElement.outerHTML
            });
          }
        } 
      } catch(e) {
        console.log(e)
      }
    }
  } 

  setInterval(() => getResponse(), 150);
`;

    const script = `
    if(!window.addedScript) {
      const scrip = document.createElement("script")
      scrip.text = ${`\`${code}\``}
      scrip.type = "text/javascript"
      document.body.append(scrip);
      window.addedScript = true;
    }
    `;

    const clickScript = `
    
    if(!window.didClick) {
      window.didClick = true;

      const commit = document.querySelector('[name="commit"]');
      if(commit) {
        commit.style.visibility = "hidden";
      }


      setTimeout(() => {
        const recapFrame = document.querySelector('iframe[src*="recaptcha.net"]');

        if(recapFrame) {
          recapFrame.contentDocument.getElementsByClassName("recaptcha-checkbox-checkmark")[0]?.click();
        }

        const hcapframe = document.querySelector('iframe[src*="hcaptcha.com"]');

        if(hcapframe) {
          hcapframe.contentDocument.getElementById("checkbox")?.click();
        }

        const geetestFrame = document.querySelector(".geetest_radar_tip");
        if(geetestFrame) {
          geetestFrame.click();
        }


      }, 125);



      if (document.URL.includes("checkouts/") && window == window.top) {
          document.getElementById("continue_button")?.scrollIntoView();
          const all = document.getElementsByTagName("*");

          for (var i = 0; i < all.length; i++) {
              try {
                  if (all[i].name.includes("checkout["))
                      all[i].style.display = "none";
              } catch {

              }
          }
          document.getElementById("continue_button").style.display = "none";
      }

      const recap = document.querySelector(".g-recaptcha");
      if(recap) {
        recap.style.display = "block";
      } 
  }
    `;

    const v3Script = `

  if(!window.grecaptcha) {
    const t = document.createElement("script");
    t.setAttribute(
      "src",
      "https://www.recaptcha.net/recaptcha/api.js?onload=v3Callback&render=${
        challenge.siteKey
      }&hl=en"
    ),
      document.body.appendChild(t);
  }

    window.v3Callback = () => {
      grecaptcha.ready(function() {
        grecaptcha.execute('${challenge.siteKey}', {action: "${
      challenge.action || "customer_login"
    }"}).then(function(token) {
          sendAnswer({
            token: token
          })
        });
      });
    }
    try {
      v3Callback()
    } catch(err) {
      console.error(err)
    }
    `;

    this.window.webContents.once("dom-ready", () => {
      this.window?.webContents.executeJavaScript(globalCode).catch((e) => {});

      if (
        challenge.version !== RecaptchaV3Score &&
        challenge.version !== RecaptchaV3Enterprise
      ) {
        this.window?.webContents.executeJavaScript(script).catch((e) => {});
        this.window?.webContents
          .executeJavaScript(clickScript)
          .catch((e) => {});
      } else {
        this.window?.webContents.executeJavaScript(v3Script).catch((e) => {});
      }
    });

    if (challenge.version === Question) {
      // this.window.loadURL(
      //   (isProd ? `${productionSiteURL}` : `http://localhost:3000`) +
      //     `/solver/question?question=${challenge.question}`
      // );
    } else {
      this.window.loadURL(
        challenge.url,
        challenge.userAgent
          ? {
              ...(challenge.version === RecaptchaV2Checkbox ||
              challenge.version === RecaptchaV2Invisible
                ? {}
                : { userAgent: challenge.userAgent }),
              httpReferrer: challenge.url,
              extraHeaders: challenge.html
                ? `X-OMG-TASKID: ${challenge.id}\n`
                : undefined,
            }
          : {
              extraHeaders: challenge.html
                ? `X-OMG-TASKID: ${challenge.id}\n`
                : undefined,
            }
      );
    }
    return Promise.resolve(true);
  }

  profileUpdated() {
    this.updateProxy();

    this.window?.setTitle(
      `Paragon Solver: ${this.solver.name} | ${this.solver.where || "any"}`
    );
  }

  async _reset() {
    return await this.loadHome();
  }
}
