import {
  RecaptchaV3Score,
  GeeTest,
  RecaptchaV2Checkbox,
  RecaptchaV2Invisible,
  HCaptchaCheckbox,
  HCaptchaInvisible,
  DataDomeChallengeResponse,
  TypeOfChallengeKey,
} from "@core/challenge/Challenge";

import { isProd } from "../core/config";
import { get } from "./main-router";
import * as Buyer from "@buyer/Buyer";
import * as QueueIt from "@queueit/QueueIt";

import { SettingsModel } from "@dal/DAL";
const AutoSolve = require("autosolve-client");

export let autoSolveConnected = false;

export interface AutoSolveRequest {
  taskId: string;
  url: string;
  siteKey: string;
  version: Exclude<TypeOfChallengeKey, 7>;
  userAgent: string;

  //v3 only
  action?: string;

  //others
  proxy?: string;
  minScore?: number;
  renderParameters?: any;
  proxyRequired?: boolean;
}

export interface AutoSolveResponse {
  taskId: string;
  token: string;
  createdAt: string;
  request: AutoSolveRequest;
}

SettingsModel.on("save", (s) => {
  if (!autoSolveConnected && s.autoSolveAccessToken && s.autoSolveApiKey) {
    initAutosolve(s.autoSolveAccessToken, s.autoSolveApiKey);
  }
});

export function sendTokenRequest(request: AutoSolveRequest) {
  if (autoSolveConnected) {
    if (request.version === RecaptchaV3Score && !request.action) {
      throw new Error("V3 requires action");
    }
    const autoSolve = AutoSolve.getInstance();
    autoSolve.sendTokenRequest(request);
  }
}

export function cancelTokenRequest(taskId: string) {
  if (autoSolveConnected) {
    const autoSolve = AutoSolve.getInstance();
    autoSolve.cancelTokenRequest(taskId);
  }
}

export function cancelAutoSolve() {
  if (autoSolveConnected) {
    try {
      const instance = AutoSolve.getInstance();
      instance?.cancelAllRequests();
    } catch (e) {
      //
    }
  }
}

export async function initAutosolve(accessToken: string, apiKey: string) {
  //cancelAutoSolve();
  if (autoSolveConnected) {
    return;
  }

  const autoSolve = AutoSolve.getInstance({
    accessToken: accessToken,
    apiKey: apiKey,
    clientKey: "Voyager-8d6c66a1-379e-4ca8-b826-1cf1cf36a790",
    shouldAlertOnCancel: true,
    debug: !isProd,
  });

  await autoSolve
    .init(accessToken, apiKey)
    .then(() => {
      autoSolve.ee.on(`AutoSolveResponse`, (data: any) => {
        const response: AutoSolveResponse = JSON.parse(data);
        const { request } = response;
        const { version, taskId } = request;

        const isQueueIt = taskId.startsWith("qit-");
        if (isQueueIt) {
          QueueIt.submitChallengeAnswer(taskId.replace("qit-", ""), {
            token: response.token,
          });
          return;
        }

        if (version === GeeTest) {
          response.token = JSON.parse(response.token);
        }

        if (
          version === RecaptchaV2Checkbox ||
          version === RecaptchaV2Invisible ||
          version === HCaptchaCheckbox ||
          version === HCaptchaInvisible
        ) {
          Buyer.submitChallengeAnswer(taskId, {
            token: response.token,
          });
        } else if (version === GeeTest) {
          const token = response.token as any;
          const r: DataDomeChallengeResponse = {
            geetest_challenge: token.challenge,
            geetest_seccode: token.seccode,
            geetest_validate: token.validate,
          };
          Buyer.submitChallengeAnswer(taskId, r);
        }
      });

      autoSolve.ee.on(`AutoSolveResponse_Cancel`, (data: any) => {
        // whatever... the task was closed
      });

      autoSolve.ee.on(`AutoSolveError`, (data: any) => {
        const event = JSON.parse(data);
        console.log(`AS Error Type: ${event.type}`);
        console.log(`AS Error: ${event.event}`);
        console.log(event);
      });
    })
    .then(() => {
      autoSolveConnected = true;
      console.log("Auto solve connected");
    })
    .catch((e: any) => {
      console.log("Auto solve not connected");
      autoSolveConnected = false;
      console.log(e);
    });
}

get("autoSolveConnected", () => {
  return autoSolveConnected;
});
