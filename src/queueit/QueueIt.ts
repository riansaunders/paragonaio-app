import { QueueItCache } from "@core/cache/QueueItCache";
import { ChallengeResponse } from "@core/challenge/Challenge";
import { TaskPage } from "@core/task-page";
import { Task } from "@entities/Task";
import { TypedEmitter } from "tiny-typed-emitter";
import { CookieJar } from "tough-cookie";
import { QueueFinishRequest } from "./QueueFinishRequest";
import { QueueItConfig } from "./QueueItConfig";
import { QueueItEvents } from "./QueueItEvents";
import { QueueItWorker } from "./QueueItWorker";

const active: QueueItWorker[] = [];
export const events = new TypedEmitter<QueueItEvents>();
export const userCache = new QueueItCache();

export function submitTask(
  config: QueueItConfig,
  eventhx?: (worker: QueueItWorker) => void
) {
  const worker = new QueueItWorker(config);

  worker.on("challengeRequest", (w, req) =>
    events.emit("challengeRequest", w, req)
  );

  worker.on("queueComplete", (d) => events.emit("queueComplete", d));

  worker.on("cancelChallenge", (d) => {
    events.emit("cancelChallenge", d);
  });

  worker.on("sessionStarted", (e) => {
    for (let w of active) {
      if (w === worker) {
        continue;
      }
      w.emit("otherSessionStarted", e);
    }
  });

  if (eventhx) {
    eventhx(worker);
  }

  worker.goToWork().then((w) => {
    removeWorker(worker);
  });

  active.push(worker);

  events.emit("workerAdded", worker);
  return worker;
}
export function getWorkerWithId(id: string) {
  return active.find((w) => w.config.task.id === id);
}

export function removeWorkerById(id: string) {
  const w = getWorkerWithId(id);
  if (w) {
    removeWorker(w);
  }
}

export function submitChallengeAnswer(id: string, answer: ChallengeResponse) {
  const worker = active.find((worker) => worker.config.task.id === id);

  if (worker) {
    worker.emit("challengeFulfilled", answer);
  }
}

export function removeWorker(worker: QueueItWorker) {
  worker.shutdown();

  const idx = active.indexOf(worker);

  worker.removeAllListeners();

  if (idx !== -1) {
    active.splice(idx, 1);
  }

  events.emit("workerRemoved", worker);
}

export function createConfig(
  req: QueueFinishRequest,
  task: Task,
  page: TaskPage,
  userAgent: string,
  jar: CookieJar
): QueueItConfig {
  const url = new URL(page.url);

  return {
    task: task,
    baseURL: url.origin,
    c: url.searchParams.get("c") ?? "footlocker",
    e: url.searchParams.get("e") ?? "",
    t: url.searchParams.get("t") ?? "",
    cid: url.searchParams.get("cid") ?? "en-US",

    url: url,
    page: page,
    userAgent: userAgent,
    jar: jar,
    triggerUrl: req.triggerUrl,

    layoutName: "",
    layoutVersion: 0,
    userId: "",
  };
}
