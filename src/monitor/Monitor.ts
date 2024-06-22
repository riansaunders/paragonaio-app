import { randomFromArray } from "@core/util/helpers";
import { MessageType } from "@entities/MessageType";
import { MonitorTask } from "@entities/MonitorTask";
import { Platform } from "@entities/Store";
import { TypedEmitter } from "tiny-typed-emitter";
import { MonitorEvents } from "./MonitorEvents";
import { FTLMonitor } from "./worker/FTLMonitor";
import { MonitorWorker } from "./worker/MonitorWorker";
import { ShopifyMonitor } from "./worker/ShopifyMonitor";
const tasks: MonitorWorker[] = [];

export const events = new TypedEmitter<MonitorEvents>();

export let locked = true;
export function setLocked(l: boolean) {
  locked = l;
}

export async function submitTasks(inb: MonitorTask[]) {
  if (locked) {
    return;
  }
  let worker: MonitorWorker;
  for (let task of inb) {
    task.message = undefined;
    task.isRunning = true;

    const pg = task.proxyGroup;

    if (pg) {
      const niu = pg.notInUse();
      task.proxy = randomFromArray(niu.length ? niu : pg.proxies);
      if (task.proxy) {
        task.proxy.increaseUsage();
      }
    }

    if (task.group.store.platform === Platform.Shopify) {
      worker = new ShopifyMonitor(task);
    } else {
      worker = new FTLMonitor(task);
    }

    let shouldRestart = false;

    worker.on("productUpdate", (worker, store, product) => {
      events.emit("productUpdate", worker, store, product);
    });

    worker.on("proxyRotateRequest", () => {
      events.emit("proxyRotateRequest", worker);
    });

    worker.on("queueitRequest", (worker, page) =>
      events.emit("queueitRequest", worker, page)
    );

    worker.on("queueitPassed", (worker, url) =>
      events.emit("queueitPassed", worker, url)
    );

    worker.on("queueitUserRequest", (worker, triggerUrl) =>
      events.emit("queueitUserRequest", worker, triggerUrl)
    );

    worker.on("taskShouldUpdate", (worker) =>
      events.emit("taskShouldUpdate", worker)
    );

    tasks.push(worker);
    worker
      .monitor()
      .catch((e) => {
        console.log(e);
        shouldRestart = true;
      })
      .finally(() => {
        removeWorkers([worker]);
        if (shouldRestart) {
          worker.updateStatus(
            "Monitor exited! Report an issue.",
            MessageType.Error
          );
          submitTasks([task]);
        }
      });
  }
}

export function removeTasksById(ids: string[]) {
  const workers = tasks.filter((worker) => ids.includes(worker.task.id));

  removeWorkers(workers);
}

export function removeWorkers(toR: MonitorWorker[]) {
  for (let task of toR) {
    const idx = tasks.indexOf(task);

    task.shutdown();
    if (idx !== -1) {
      task.removeAllListeners();
      tasks.splice(idx, 1);
    }
  }
  events.emit("workerRemoved", toR);
}

export function getWorkerWithId(id: string) {
  return tasks.find((task) => task.task.id === id);
}

export function clearWorkers() {
  removeWorkers(tasks);
}
export function activeCount() {
  return tasks.length;
}
