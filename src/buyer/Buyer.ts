import { ProductCache } from "@core/cache/ProductCache";
import { ChallengeResponse } from "@core/challenge/Challenge";
import { randomFromArray } from "@core/util/helpers";
import { BuyerTask } from "@entities/BuyerTask";
import { MessageType } from "@entities/MessageType";
import { Platform } from "@entities/Store";
import { TypedEmitter } from "tiny-typed-emitter";
import { BuyerEvents } from "./BuyerEvents";
import { FTLBuyerWorker } from "./footsites/FTLBuyerWorker";
import { createShopifyWorker } from "./shopify/shopify";
import { BuyerWorker } from "./worker/BuyerWorker";
import { ErrorOccured, Shutdown } from "./worker/task-status";

const active: BuyerWorker[] = [];
export let productCache: ProductCache = new ProductCache();
export let locked = true;

productCache.setMaxListeners(10000);

export function setLocked(l: boolean) {
  locked = l;
}

export const events = new TypedEmitter<BuyerEvents>();

export function submitTasks(tasks: BuyerTask[]) {
  if (locked) {
    return;
  }

  const added: BuyerWorker[] = [];
  const now = new Date();

  for (let task of tasks) {
    task.exitStatus = undefined;
    task.message = undefined;
    task.start = now;
    task.isRunning = true;
    task.product = undefined;

    task.account = task.accountGroup?.accounts
      ? randomFromArray(task.accountGroup.accounts)
      : undefined;

    const store = task.group.store;

    const existing = active.find((w) => w.task.id === task.id);

    if (existing) {
      removeWorker(existing);
    }

    const pg = task.proxyGroup;

    if (pg) {
      const niu = pg.notInUse();
      task.proxy = randomFromArray(niu.length ? niu : pg.proxies);
      if (task.proxy) {
        task.proxy.increaseUsage();
      }
      console.log("Free | Total");
      console.log(pg.notInUse().length, pg.proxies.length);
    }

    const platform = store.platform;
    let worker: BuyerWorker | undefined;

    if (platform === Platform.Shopify) {
      worker = createShopifyWorker(task);
    } else if (platform === Platform.Footsite) {
      worker = new FTLBuyerWorker(task);
    }
    if (!worker) {
      throw new Error("Not worker");
    }

    added.push(worker);

    worker.on("challengeRequest", (worker, request) =>
      events.emit("challengeRequest", worker, request)
    );
    worker.on("cancelChallenge", (worker) =>
      events.emit("cancelChallenge", worker)
    );

    worker.on("checkoutComplete", (worker, success) =>
      events.emit("checkoutComplete", worker, success)
    );

    worker.on("proxyRotateRequest", (worker) =>
      events.emit("proxyRotateRequest", worker)
    );

    worker.on("productRequest", (worker) =>
      events.emit("productRequest", worker)
    );

    worker.on("queueitRequest", (worker, page) =>
      events.emit("queueitRequest", worker, page)
    );

    worker.on("queueitUserRequest", (worker, triggerUrl) =>
      events.emit("queueitUserRequest", worker, triggerUrl)
    );

    worker.on("logUpdate", (w, m, t) => events.emit("logUpdate", w, m, t));

    worker.on("queueitPassed", (worker, url) =>
      events.emit("queueitPassed", worker, url)
    );

    worker.on("taskShouldUpdate", (worker) =>
      events.emit("taskShouldUpdate", worker)
    );

    active.push(worker);

    const ref = worker;

    let shouldRestart = false;

    worker
      .goToWork()
      .then(() => {
        // console.log(`Worker exited`, new Date().getTime() - start + "ms");
      })
      .catch((e) => {
        shouldRestart = true;
        ref.log("Task crashed, Restarting.", MessageType.Error);
        ref.updateStatus(ErrorOccured);
        ref.log(String(e), MessageType.Error);
      })
      .finally(() => {
        removeWorker(ref);
        if (shouldRestart) {
          submitTask(task);
        }
      });
  }
  if (added.length) {
    events.emit("workerAdded", added);
  }
}

export async function submitTask(request: BuyerTask) {
  return submitTasks([request]);
}

export function hasRequestWithIdentifier(id: string) {
  const worker = active.find((w) => w.task.id === id);
  return typeof worker !== "undefined";
}

export function getWorkerWithId(id: string) {
  const worker = active.find((w) => w.task.id === id);

  return worker;
}

export function submitChallengeAnswer(id: string, answer: ChallengeResponse) {
  const worker = active.find((worker) => worker.task.id === id);

  if (worker) {
    worker.emit("challengeCompleted", answer);
  }
}

export function updateTasks(ids: string[]) {
  const workers = active.filter((worker) => ids.includes(worker.task.id));

  workers.forEach((worker) => {
    worker.onRequestUpdated();
  });
}

export function updateTask(taskID: string) {
  updateTasks([taskID]);
}

export function clearWorkers() {
  removeWorkers(active, Shutdown);
}

export function activeCountBySkuGroupAndStore(
  groupId: string,
  sku: string,
  storeURI: string
) {
  return active.filter(
    (w) =>
      w.task.group.id === groupId &&
      w.task.monitor === sku &&
      w.requestURL === storeURI
  ).length;
}

export function activeCount() {
  return active.length;
}

export function retryWorkerChallengeRequest(id: string) {
  const worker = active.find((w) => w.task.id === id);
  if (worker) {
    worker.emit("retryChallengeRequest");
  }
}

export function removeWorker(
  worker: BuyerWorker,
  status?: string,
  severity: MessageType = MessageType.Info
) {
  if (hasRequestWithIdentifier(worker.task.id)) {
    removeWorkers([worker], status, severity);
  }
}

export function removeWorkers(
  workers: BuyerWorker[],
  status?: string,
  severity: MessageType = MessageType.Info
) {
  if (!workers.length) {
    return;
  }
  for (let worker of workers) {
    if (status) {
      worker.updateStatus(status, severity);
    }
    worker.shutdown();

    const idx = active.indexOf(worker);

    worker.removeAllListeners();
    if (idx !== -1) {
      active.splice(idx, 1);
    }
  }
  events.emit("workerRemoved", workers);
  if (active.length < 1) {
    events.emit("allWorkersRemoved");
  }
}

export function stopProfile(profileId: string) {
  const workers = active
    .filter((w) => w.task.profile.id === profileId)
    .map((w) => w.task.id);
  stopTasks(workers);
}

export function stopTasks(taskIDs: string[]) {
  const workers = active.filter((worker) => taskIDs.includes(worker.task.id));
  removeWorkers(workers);
}

export function stopTask(taskID: string) {
  stopTasks([taskID]);
}
