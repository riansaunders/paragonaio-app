import {
  autoSolveConnected,
  cancelTokenRequest,
  sendTokenRequest,
} from "@app/aycd";
import * as Buyer from "@buyer/Buyer";
import {
  Any,
  ChallengeRequest,
  ChallengeResponse,
  DataDomeChallengeResponse,
  GeeTest,
  Question,
  QueueItChallenge,
  WhereChallengeKey,
} from "@core/challenge/Challenge";
import { proxyToObject } from "@core/util/helpers";
import { BasicProxy } from "@entities/BasicProxy";
import { SolverType } from "@entities/Solver";
import { Platform } from "@entities/Store";
import * as QueueIt from "@queueit/QueueIt";
import { app } from "electron";
import fs from "fs";
import { SettingsModel, SolverModel } from "src/dal/DAL";
import { capMonster, twoCaptcha } from "./captchas";
import { post } from "./main-router";
import { SolverWindow } from "./SolverWindow";

//experimental
export interface ReceivedChallenge extends ChallengeRequest {
  source: "buyer" | "queueit";
  active?: boolean;
}

QueueIt.events.on("cancelChallenge", (worker) => {
  cancelChallenge(worker.config.task.id);
});

QueueIt.events.on("challengeRequest", (w, challenge) => {
  if (w.isShutdown || w.isFinished) {
    return;
  }

  const { task, userAgent } = w.config;

  const twoCap = SolverModel.all().find(
    (s) => s.type === SolverType.TwoCaptcha && s.key
  );
  const capMon = SolverModel.all().find(
    (s) => s.type === SolverType.CapMonster && s.key
  );

  const settings = SettingsModel.first();

  if (
    autoSolveConnected &&
    settings?.autoSolveQueueIt &&
    challenge.version !== Question
  ) {
    w.updateStatus("[Queue-It] Requesting AutoSolve..");
    sendTokenRequest({
      taskId: `qit-${task.id}`,
      url: challenge.url,
      siteKey:
        challenge.version === GeeTest
          ? challenge.geetest_GT!
          : challenge.siteKey,
      version: challenge.version,
      userAgent: challenge.userAgent || userAgent,
      proxy: task.proxy?.proxyString,
      renderParameters:
        challenge.version === GeeTest
          ? {
              challenge: challenge.geetest_Challenge,
              api_server: challenge.geetest_ApiServer,
            }
          : undefined,
    });
  } else if (settings?.thirdPartyQueueIt && (twoCap || capMon)) {
    if (capMon) {
      w.updateStatus("[Queue-It] Requesting CapMonster...");
      capMonster(w, capMon, challenge)
        .then((recaptchaToken) => {
          w.updateStatus("[Queue-It] CapMonster received");
          QueueIt.submitChallengeAnswer(w.config.task.id, {
            token: recaptchaToken,
          });
        })
        .catch(() => {
          setTimeout(() => {
            w.emit("challengeRequest", w, challenge);
          }, 5000);
        });
    } else if (twoCap) {
      w.updateStatus("[Queue-It] Requesting 2Cap...");
      twoCaptcha(w, twoCap, challenge)
        .then((r) => {
          w.updateStatus("[Queue-It] 2Cap received");

          QueueIt.submitChallengeAnswer(w.config.task.id, {
            token: r,
          });
        })
        .catch(() => {
          setTimeout(() => {
            w.emit("challengeRequest", w, challenge);
          }, 5000);
        });
    }
  } else {
    w.updateStatus("[Queue-It] Requesting manual captcha...");

    queueManualChallenge({
      ...challenge,
      source: "queueit",

      where: challenge.where,
      version: challenge.version!,
      url: challenge.url,
      cookies: challenge.cookies,
      html: challenge.html,
      siteKey: challenge.siteKey!,
      userAgent: challenge.userAgent,
    });
  }
});

Buyer.events.on("cancelChallenge", (worker) => {
  cancelChallenge(worker.task.id);
});
Buyer.events.on("challengeRequest", (worker, challenge) => {
  const { task } = worker;
  if (
    autoSolveConnected &&
    challenge.version !== Question &&
    challenge.where !== QueueItChallenge &&
    task.group.store.platform !== Platform.Shopify
  ) {
    sendTokenRequest({
      taskId: task.id,
      url: challenge.url,
      siteKey:
        challenge.version === GeeTest
          ? challenge.geetest_GT!
          : challenge.siteKey,
      version: challenge.version,
      userAgent: challenge.userAgent || worker.userAgent,
      proxy: task.proxy?.proxyString,
      renderParameters:
        challenge.version === GeeTest
          ? {
              challenge: challenge.geetest_Challenge,
              api_server: challenge.geetest_ApiServer,
            }
          : undefined,
    });
    return;
  }
  const twoCap = SolverModel.all().find(
    (s) => s.type === SolverType.TwoCaptcha && s.key
  );
  const capMon = SolverModel.all().find(
    (s) => s.type === SolverType.CapMonster && s.key
  );

  if (
    // it's shopify
    task.group.store.platform === Platform.Shopify ||
    // we don't have any 3rd parties
    (!twoCap && !capMon) ||
    // we only have capmonster and it's geetest
    (!twoCap && challenge.version === GeeTest)
  ) {
    queueManualChallenge({
      ...challenge,
      source: "buyer",

      where: challenge.where,
      version: challenge.version!,
      url: challenge.url,
      cookies: challenge.cookies,
      html: challenge.html,
      siteKey: challenge.siteKey!,
      userAgent: challenge.userAgent,
    });
    return;
  }
  if (capMon) {
    capMonster(worker, capMon, challenge)
      .then((recaptchaToken) => {
        Buyer.submitChallengeAnswer(worker.task.id, {
          token: recaptchaToken,
        });
      })
      .catch(() => {
        setTimeout(() => {
          Buyer.retryWorkerChallengeRequest(worker.task.id);
        }, 5000);
      });
  } else if (twoCap) {
    twoCaptcha(worker, twoCap, challenge)
      .then((r) => {
        if (challenge.version === GeeTest) {
          Buyer.submitChallengeAnswer(worker.task.id, <
            DataDomeChallengeResponse
          >{
            geetest_challenge: r.challenge,
            geetest_validate: r.validate,
            geetest_seccode: r.seccode,
          });
        } else {
          Buyer.submitChallengeAnswer(worker.task.id, {
            token: r,
          });
        }
      })
      .catch(() => {
        setTimeout(() => {
          Buyer.retryWorkerChallengeRequest(worker.task.id);
        }, 5000);
      });
  }
});

SolverModel.on("remove", async (s) => {
  if (s.type === SolverType.Manual) {
    const { id } = s;
    try {
      fs.rmdirSync(app.getPath("userData") + "/profiles/" + id);
    } catch (e) {
      //
    }

    // remove the open solver
    const solver = solverWindows.find((s) => s.solver.id === id);
    if (solver) {
      closeAndRemoveSolver(id);
    }
  }
});

SolverModel.on("save", (s) => {
  const win = solverWindows.find((w) => w.solver.id === s.id);
  if (win) {
    win.solver = s;
    win.profileUpdated();

    if (!win.challenge) {
      assignChallenge(win);
    }
  } else {
    const { where } = s;
    const challenge = challenges.find((c) => {
      return (where === Any || c.where === where) && !c.active;
    });
    if (challenge) {
      openSolver(s.id, false);
    }
  }
});

app.on("login", (event, webContents, request, authInfo, callback) => {
  if (authInfo.isProxy) {
    event.preventDefault();

    const proxy = proxyMap.get(webContents.id);
    if (proxy?.proxyString) {
      const obj = proxyToObject(proxy);
      const { username, password } = obj;

      callback(username, password);
    } else {
      callback();
    }
  }
});

let solverWindows: SolverWindow[] = [];
export let challenges: ReceivedChallenge[] = [];
export let proxyMap: Map<number, BasicProxy | undefined> = new Map();

function assignChallenge(solver: SolverWindow) {
  const where: WhereChallengeKey = solver.solver.where!;
  const challenge = challenges.find((c) => {
    return (where === Any || c.where === where) && !c.active;
  });

  if (challenge) {
    solver.challenge = challenge;
    challenge.active = true;
    solver.acceptChallenge(challenge);
  }
}

export async function sendChallengeAnswer(
  id: string,
  answer: ChallengeResponse
) {
  const challenge = challenges?.find((c) => c.id === id);
  const window = solverWindows?.find((l) => l.challenge?.id === id);

  console.log("Source", challenge?.source);
  if (challenge) {
    if (challenge.source === "buyer") {
      Buyer.submitChallengeAnswer(id, answer);
    } else {
      QueueIt.submitChallengeAnswer(id, answer);
    }

    const idx = challenges.findIndex((c) => c.id === id);
    if (idx !== -1) {
      challenges.splice(idx, 1);
    }
    if (window) {
      const where: WhereChallengeKey = window.solver.where!;
      const newChallenge = challenges.find((c) => {
        return (where === Any || c.where === where) && !c.active;
      });
      if (!newChallenge) {
        await window.sendReset();
      } else {
        assignChallenge(window);
      }
    }
  }
}

export function cancelChallenge(taskID: string) {
  cancelTokenRequest(taskID);

  const challengeIdx = challenges.findIndex((c) => c.id === taskID);
  const window = solverWindows?.find((w) => w.challenge?.id === taskID);
  if (window) {
    window.sendReset();
  }
  if (challengeIdx !== -1) {
    challenges.splice(challengeIdx, 1);
  }
  if (window) {
    assignChallenge(window);
  }
}

export async function queueManualChallenge(req: ReceivedChallenge) {
  let challenge = challenges?.find((c) => c.id === req.id);

  // find an idle window
  let idleWindowIdx = solverWindows.findIndex(
    (l) =>
      (l.solver.where === req.where || l.solver.where === Any) && !l.challenge
  );

  const openIds = solverWindows.map((s) => s.solver.id);

  // we dont have anything open so lets try to open one
  if (idleWindowIdx === -1) {
    const anyNotOpen = SolverModel.all()
      .filter((s) => s.type === SolverType.Manual)
      .find(
        (s) =>
          (!s.where || s.where === Any || s.where === req.where) &&
          s.type === SolverType.Manual &&
          !openIds.includes(s.id)
      );

    if (anyNotOpen) {
      await openSolver(anyNotOpen.id, false);
      idleWindowIdx = solverWindows.findIndex(
        (s) => s.solver.id === anyNotOpen.id
      );
    }
  }

  if (idleWindowIdx !== -1) {
    // if we have something waiting, consume immediately
    const window = solverWindows[idleWindowIdx];
    try {
      if (!challenge) {
        challenges.push(
          (challenge = {
            ...req,
            active: true,
          })
        );
      } else {
        challenge.active = true;
      }

      window.acceptChallenge(challenge);
    } catch (err) {
      console.log(err);

      return;
    }
  } else {
    challenges.push({
      ...req,
      active: false,
    });
  }
}

export async function openSolver(id: string, loadHome: boolean = true) {
  const openedSolver = solverWindows.find((s) => s.solver.id === id);
  if (openedSolver) {
    openedSolver.show();
    return;
  }
  const profile = SolverModel.all().find((p) => p.id === id);
  if (profile) {
    let window: SolverWindow;

    window = new SolverWindow(profile);

    await window.open(loadHome);

    solverWindows.push(window);

    assignChallenge(window);

    window.on("challengeComplete", (p, a) => {
      sendChallengeAnswer(p.challenge!.id!, a);
    });
    window.once("closed", (id) => closeAndRemoveSolver(profile.id));
  }
}

function closeAndRemoveSolver(profileId: string) {
  const solverIdx = solverWindows.findIndex((w) => w.solver.id === profileId);
  if (solverIdx !== -1) {
    const solver = solverWindows[solverIdx];
    const challenge = challenges.find((c) => c.id === solver.challenge?.id);
    let shouldReOpen = false;
    if (challenge) {
      const replacementSolver = solverWindows.find(
        (other) =>
          (other.solver.type === solver.solver.type ||
            other.solver.where === Any) &&
          !other.challenge
      )!;

      if (replacementSolver) {
        challenge.active = true;
        replacementSolver.acceptChallenge(challenge);
      } else {
        shouldReOpen = true;
        // window was closed, and there is no replacement. challenge is no longer active.
        challenge.active = false;
      }
    }

    solver.close();
    solverWindows.splice(solverIdx, 1);

    if (shouldReOpen) {
      openSolver(profileId, false);
    }
  }
}
export function clearOpenChallengesAndSolvers() {
  challenges = [];
  solverWindows = [];
}

post("openURLInSolver", async (req) => {
  const { id, url, userAgent } = req.body;

  let solver = solverWindows.find((s) => s.solver.id === id);

  if (!solver) {
    await openSolver(id, false);

    solver = solverWindows.find((s) => s.solver.id === id);
  }
  solver?.openURL(url, userAgent);
});

post("challengeAnswer", async (req) => {
  const { challengeId, answer } = req.body;

  sendChallengeAnswer(challengeId, answer);
});

post("openSolver", async (req) => {
  await openSolver(req.body.id);
});
