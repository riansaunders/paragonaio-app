import { BuyerWorker } from "@buyer/worker/BuyerWorker";
import { ChallengeRequest, GeeTest } from "@core/challenge/Challenge";
import { MessageType } from "@entities/MessageType";
import { Solver } from "@entities/Solver";
import { QueueItWorker } from "@queueit/QueueItWorker";
import qs from "qs";

// 2captcha
export async function twoCaptcha(
  worker: BuyerWorker | QueueItWorker,

  solver: Solver,
  challengeReq: ChallengeRequest
) {
  const proxy =
    worker instanceof BuyerWorker
      ? worker.task.proxy
      : worker.config.task.proxy;
  const key = solver!.key;
  let twocapResponse: any;
  if (challengeReq.version === GeeTest) {
    twocapResponse = await worker
      .get(
        "http://2captcha.com/in.php?" +
          qs.stringify({
            key: key,
            json: 1,
            method: "geetest",
            gt: challengeReq.geetest_GT,
            challenge: challengeReq.geetest_Challenge,
            pageurl: challengeReq.url,

            ...(proxy
              ? {
                  proxy: proxy.proxyString,
                }
              : {}),
            ...(challengeReq.geetest_ApiServer
              ? {
                  api_server: challengeReq.geetest_ApiServer,
                }
              : {}),

            ...(challengeReq.userAgent
              ? {
                  userAgent: challengeReq.userAgent,
                }
              : {}),
          })
      )
      .then((r) => r.data)
      .catch((e) => {
        worker.log(`2Captcha said:`, MessageType.Error);
        worker.log(String(e?.response.data || "unknown"));
        worker.log(
          JSON.stringify(e?.response.data || { message: "unknown" }),
          MessageType.Error
        );
        throw e;
      });
  } else {
    twocapResponse = await worker
      .get(
        "http://2captcha.com/in.php?" +
          qs.stringify({
            key: key,
            json: 1,
            method: "userrecaptcha",
            pageurl: challengeReq.url,
            googlekey: challengeReq.siteKey,
            ...(challengeReq.userAgent
              ? {
                  userAgent: challengeReq.userAgent,
                }
              : {}),
          })
      )
      .then((r) => r.data)
      .catch((e) => {
        worker.log(`2Captcha said:`, MessageType.Error);
        worker.log(String(e?.response.data || "unknown"));

        worker.log(
          JSON.stringify(e?.response.data || { message: "unknown" }),
          MessageType.Error
        );
        console.error(e);
        throw e;
      });
  }

  if (twocapResponse.status === 1) {
    const getResponse = async () => {
      if (worker.isShutdown) {
        return undefined;
      }

      return await worker
        .get(
          "http://2captcha.com/res.php?" +
            qs.stringify({
              key: key,
              action: "get",
              id: twocapResponse.request,
              json: 1,
            })
        )
        .then((r) => r.data)
        .then((d) => {
          if (d.status === 0) {
            if (d.request === "ERROR_CAPTCHA_UNSOLVABLE") {
              throw new Error("2Captcha says it's unsolvable.");
            }
            return new Promise((resolve) => {
              setTimeout(() => resolve(getResponse()), 5000);
            });
          } else {
            return d.request;
          }
        });
    };

    return getResponse();
  } else {
    worker.updateStatus(
      `2Captcha: ${twocapResponse.request}`,
      MessageType.Error
    );

    throw new Error("Error in response");
  }
}

export async function capMonster(
  worker: BuyerWorker | QueueItWorker,
  solver: Solver,
  challengeReq: ChallengeRequest
): Promise<string> {
  const key = solver.key;
  const capmonResponse = await worker
    .post("https://api.capmonster.cloud/createTask", {
      clientKey: key,
      task: {
        type: "NoCaptchaTaskProxyless",
        websiteURL: challengeReq.url,
        websiteKey: challengeReq.siteKey,
        cookies: challengeReq.cookies,
        ...(challengeReq.userAgent
          ? {
              userAgent: challengeReq.userAgent,
            }
          : {}),
      },
    })
    .then((r) => r.data)
    .catch((e) => {
      worker.log(`CapMonster said:`);
      worker.log(String(e?.response.data || "unknown"));

      worker.log(JSON.stringify(e?.response.data || { message: "unknown" }));
      throw e;
    });
  if (capmonResponse.errorId === 0) {
    const getResponse = async () => {
      if (worker.isShutdown) {
        return undefined;
      }
      return await worker
        .post("https://api.capmonster.cloud/getTaskResult", {
          clientKey: key,
          taskId: capmonResponse.taskId,
        })
        .then((r) => r.data)
        .then((d) => {
          if (d.status === "processing") {
            return new Promise((resolve) => {
              setTimeout(() => resolve(getResponse()), 5000);
            });
          } else {
            return d.solution.gRecaptchaResponse;
          }
        });
    };
    return getResponse();
  }
  worker.log("Captcha Returned Error", MessageType.Error);
  throw new Error("Error in response");
}
