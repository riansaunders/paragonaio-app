import * as Buyer from "@buyer/Buyer";
import { BuyerWorker } from "@buyer/worker/BuyerWorker";
import { CachedProduct, productCompare } from "@core/cache/ProductCache";
import {
  findVariantMatchingSizeAvailable,
  formatProductURL,
  randomFromArray,
} from "@core/util/helpers";
import { serialize } from "@core/util/serial";
import { BuyerTask } from "@entities/BuyerTask";
import { MessageType } from "@entities/MessageType";
import { MonitorTask } from "@entities/MonitorTask";
import { Platform } from "@entities/Store";
import { Task } from "@entities/Task";
import * as Monitor from "@monitor/Monitor";
import { MonitorWorker } from "@monitor/worker/MonitorWorker";
import { QueueFinishRequest } from "@queueit/QueueFinishRequest";
import * as QueueIt from "@queueit/QueueIt";
import { QueueItUser } from "@queueit/QueueItUser";
import { clipboard } from "electron";
import {
  CompletedBuyerModel,
  ProxyGroupModel,
  SettingsModel,
  TaskGroupModel,
} from "src/dal/DAL";
import { v4 } from "uuid";
import * as Cloud from "./ably";
import * as Api from "./api";
import { postDecline, postSuccess } from "./discord";
import { playSound, sendMessage } from "./main";
import { post } from "./main-router";

Buyer.events.on("productRequest", async (worker) => {
  if (worker.isShutdown) {
    return;
  }

  const existing = Buyer.productCache.find(
    worker.requestURL,
    worker.task.monitor
  );
  if (existing) {
    const sizes = worker.task.sizes;

    const available = findVariantMatchingSizeAvailable(
      existing.variants,
      sizes,
      worker.forceIgnoreAvailability
    );
    if (available) {
      return worker.productFulfilled(existing);
    }
  }

  const listener = (product: CachedProduct) => {
    if (
      product.storeUrl === worker.requestURL &&
      productCompare(product, worker.task.monitor)
    ) {
      const sizes = worker.task.sizes;

      const available = findVariantMatchingSizeAvailable(
        product.variants,
        sizes,
        worker.forceIgnoreAvailability
      );
      if (available) {
        Buyer.productCache.removeListener("itemUpdated", listener);

        return worker.productFulfilled(product);
      }
    }
  };

  if (worker.task.group.store.platform === Platform.Footsite) {
    const serverAnswer = await Api.singletonGet<CachedProduct>(
      `/product?monitor=${encodeURI(worker.task.monitor)}&storeUrl=${encodeURI(
        worker.requestURL
      )}`
    );

    if (serverAnswer) {
      const sizes = worker.task.sizes;

      const available = findVariantMatchingSizeAvailable(
        serverAnswer.variants,
        sizes,
        worker.forceIgnoreAvailability
      );

      if (available) {
        Buyer.productCache.removeListener("itemUpdated", listener);
        Buyer.productCache.update(serverAnswer.storeUrl, serverAnswer);
        return worker.productFulfilled(serverAnswer);
      }
    }
  }

  worker.updateStatus("Waiting for stock in size(s)", MessageType.Warning);
  Buyer.productCache.on("itemUpdated", listener);
});

Buyer.events.on("proxyRotateRequest", (w) => {
  const notInUse = w.task.proxyGroup?.notInUse();

  if (!notInUse || !notInUse.length) {
    return w.emit("proxyRotateCompleted");
  }

  const random = randomFromArray(notInUse);
  if (random) {
    w.task.proxy?.decreaseUsage();
    w.task.proxy = random;
  }
  return w.emit("proxyRotateCompleted");
});

Buyer.events.on("taskShouldUpdate", (worker) => {
  const task = worker.task;

  queueGroupUpdate(task, "buyer");
  queueUIUpdate(worker.task.group.id, "buyer");
});

Buyer.events.on("workerRemoved", (w) => {
  const tgs = new Set<string>();
  const pts = new Set<string>();

  for (let worker of w) {
    const task = worker.task;
    if (task.proxy) {
      task.proxy.decreaseUsage();
    }

    if (task.profile.singleCheckout && task.exitStatus === "checkout") {
      // pts.add(task.profile.id);
    }

    if (task.isRunning) {
      task.message =
        task.exitStatus || task.message?.type === MessageType.Error
          ? task.message
          : undefined;
      task.isRunning = false;

      tgs.add(worker.task.group.id);
      queueGroupUpdate(task, "buyer");
    }
  }
  for (let id of Array.from(tgs)) {
    queueUIUpdate(id, "buyer");
  }
  for (let id of Array.from(pts)) {
    try {
      Buyer.stopProfile(id);
    } catch (err) {
      console.error(err);
      continue;
    }
  }
});

Buyer.events.on("checkoutComplete", async (w, success) => {
  w.task.exitStatus = success ? "checkout" : "decline";

  const settings = SettingsModel.first();
  if (success) {
    playSound("checkout.mp3");
  }
  if (!success && settings?.declineSound) {
    playSound("yeet.mp3");
  }

  if (w.task.product) {
    const prod = w.task.product;

    if (settings?.discordWebhook) {
      const props = {
        details: prod,
        profileName: w.task.profile.name,
        store: w.task.group.store,
        webhookURL: settings.discordWebhook,
        proxyGroupName: w.task.proxyGroup?.name,
      };

      if (success) {
        await postSuccess(props);
      } else if (settings.postDeclinesToHook) {
        await postDecline(props);
      }
    }

    try {
      const cm = CompletedBuyerModel.create({
        store: w.task.group.store,
        product: {
          ...prod.product,
          // @ts-ignore
          variants: undefined,
          // @ts-ignore
          productForm: undefined,
          size: prod.variant.size,
        },
        date: Date.now().toString(),
        success: success,
      });

      cm.save();
      sendMessage(`update_${CompletedBuyerModel.name}`, serialize(cm));
    } catch (err) {
      //
    }
  }
});

Buyer.events.on("queueitPassed", (w, url) => handleQueueItPassed(w, url));

Buyer.events.on("queueitRequest", async (w, req) =>
  handleQueueFinishRequest(w, req)
);

Buyer.events.on("logUpdate", (w, m, t) => {
  console.log(`[${MessageType[t]}]: ${m}`);
});

Buyer.events.on("queueitUserRequest", (w, triggerUrl) =>
  handleQueueUserRequest(w, triggerUrl)
);

// Monitor Events

Monitor.events.on("queueitPassed", (w, url) => handleQueueItPassed(w, url));

Monitor.events.on("queueitRequest", async (w, req) =>
  handleQueueFinishRequest(w, req)
);

Monitor.events.on("queueitUserRequest", (w, triggerUrl) =>
  handleQueueUserRequest(w, triggerUrl)
);

Monitor.events.on("taskShouldUpdate", (worker) => {
  const task = worker.task;

  queueGroupUpdate(task, "monitor");
  queueUIUpdate(worker.task.group.id, "monitor");
});

Monitor.events.on("proxyRotateRequest", (w) => {
  const notInUse = w.task.proxyGroup?.notInUse();

  if (!notInUse || !notInUse.length) {
    return w.emit("proxyRotateCompleted");
  }

  const random = randomFromArray(notInUse);
  if (random) {
    w.task.proxy?.decreaseUsage();
    w.task.proxy = random;
  }
  return w.emit("proxyRotateCompleted");
});

Monitor.events.on("workerRemoved", (w) => {
  for (let worker of w) {
    if (worker.task.isRunning) {
      if (!Monitor.getWorkerWithId(worker.task.id)) {
        worker.task.proxy?.decreaseUsage();
        worker.task.message = undefined;
        worker.task.isRunning = false;
        // if (worker.task.proxy) {
        //   worker.task.proxy.inUse = false;
        //   worker.task.proxy = undefined;
        // }
      }

      queueGroupUpdate(worker.task, "monitor");
      queueUIUpdate(worker.task.group.id, "monitor");
    }
  }
});

Monitor.events.on("productUpdate", (w, s, p) => {
  const existing = Buyer.productCache.find(s, p.id);
  if (!existing) {
    const cp: CachedProduct = {
      ...p,
      storeUrl: s,
    };
    Cloud.sendMessage({
      op: "product",
      p: cp,
    });
    if (w.task.group.store.platform === Platform.Footsite) {
      Api.client.post("/product", cp).catch((e) => {});
    }
  }

  Buyer.productCache.update(s, p);
});

// frame-rate on UI updates
const refreshRate = 1000 / 12;
type GroupUpdates = {
  buyers: Task[];
  monitors: Task[];
};

const pendingGroupUpdates = new Map<string, GroupUpdates>();
let buyerIdsToUpdate = new Set();
let monitorIdsToUpdate = new Set();

// the updater
setInterval(() => {
  for (let key of Array.from(pendingGroupUpdates.keys())) {
    const updates = pendingGroupUpdates.get(key);
    if (updates) {
      sendMessage("updateGroup", {
        group: key,
        buyers: updates.buyers,
        monitors: updates.monitors,
      });
      updates.buyers = [];
      updates.monitors = [];
    }
    sendMessage(`updateTaskGroup_${key}`);
  }

  for (let id of Array.from(buyerIdsToUpdate)) {
    sendMessage(`updateBuyerView_${id}`);
  }
  for (let id of Array.from(monitorIdsToUpdate)) {
    sendMessage(`updateMonitorView_${id}`);
  }
  pendingGroupUpdates.clear();
  buyerIdsToUpdate.clear();
  monitorIdsToUpdate.clear();
}, refreshRate);

post("deleteBuyers", async ({ body }) => {
  const { group: groupId, ids } = body;
  const group = TaskGroupModel.findById(groupId);
  if (!group) {
    return;
  }
  group.buyers = group.buyers.filter((p) => !ids.includes(p.id));
  group.save();
});

function handleQueueItPassed(w: MonitorWorker | BuyerWorker, url: string) {
  const user: QueueItUser = {
    uuid: v4(),
    triggerUrl: url,
    cookies: w.jar
      .getCookiesSync(w.requestURL)
      .filter((c) => {
        const key = c.key.toLowerCase();
        return (
          !key.includes("jsessionid") &&
          !key.includes("cart-guid") &&
          !key.includes("datadome")
        );
      })
      .map((c) => JSON.stringify(c)),
  };

  if (user.cookies.length) {
    Api.client.post("/queueit", user).catch((e) => {});

    // Cloud.sendMessage({
    //   op: "queueuser",
    //   u: user,
    // });
    QueueIt.userCache.update(user);
  }

  w.activeQueueFinish = undefined;
  w.activeQueueUser = undefined;

  QueueIt.removeWorkerById(w.task.id);
}

async function handleQueueUserRequest(
  w: MonitorWorker | BuyerWorker,
  triggerUrl: string
) {
  const existing = QueueIt.userCache.find(triggerUrl);

  if (existing && w.activeQueueUser?.uuid !== existing.uuid) {
    w.activeQueueUser = existing;
    return w.queueUserFulfilled(existing);
  }
  // const serverAnswer = await Api.singletonGet<QueueItUser>(
  //   `/queueit?triggerUrl=${encodeURI(triggerUrl)}`
  // );

  // if (serverAnswer && w.activeQueueUser?.uuid !== serverAnswer.uuid) {
  //   w.activeQueueUser = serverAnswer;
  //   return w.queueUserFulfilled(serverAnswer);
  // }

  return w.queueUserFulfilled(undefined);
}

async function handleQueueFinishRequest(
  w: MonitorWorker | BuyerWorker,
  req: QueueFinishRequest
) {
  const { triggerUrl, page } = req;
  const config = QueueIt.createConfig(req, w.task, page, w.userAgent, w.jar);
  const qw = QueueIt.submitTask(config, (qw) => {
    qw.on("log", (what) => {
      if (w instanceof BuyerWorker) {
        w.log(what);
      }
    });
    qw.once("queueComplete", (d) => {
      if (d.blocked) {
        qw.shutdown();
        handleQueueFinishRequest(w, req);
      } else {
        w.queueFinishFulfilled(d);
      }
    });

    qw.on("statusUpdate", (m, t) => {
      w.updateStatus(m, t);
    });
    qw.on("progressUpdate", (num) =>
      w.updateStatus(`Queue In Progress...`, MessageType.Warning)
    );
  });

  const userListener = (user: QueueItUser) => {
    if (user.triggerUrl === triggerUrl) {
      w.activeQueueUser = user;
      QueueIt.userCache.removeListener("itemUpdated", userListener);
      w.queueUserFulfilled(user);
      return w.queueFinishFulfilled(undefined);
    }
  };

  QueueIt.userCache.on("itemUpdated", userListener);
  if (w instanceof MonitorWorker) {
    w.once("shutdown", () => qw.shutdown());
  } else if (w instanceof BuyerWorker) {
    w.once("shutdown", () => qw.shutdown());
  }
}

export function queueGroupUpdate(task: Task, type: "monitor" | "buyer") {
  let g = pendingGroupUpdates.get(task.group.id);
  if (!g) {
    pendingGroupUpdates.set(
      task.group.id,
      (g = {
        buyers: [],
        monitors: [],
      })
    );
  }
  if (type === "monitor") {
    g.monitors.push(serializeTask(task));
  } else {
    g.buyers.push(serializeTask(task));
  }
}

export function queueUIUpdate(id: string, type: "monitor" | "buyer") {
  if (type === "monitor") {
    monitorIdsToUpdate.add(id);
  } else {
    buyerIdsToUpdate.add(id);
  }
}

function serializeTask(task: Task) {
  return serialize(
    {
      id: task.id,
      proxy: task.proxy,
      monitor: task.monitor,
      isRunning: task.isRunning,
      message: task.message,
      product: task.product,
      exitStatus: (task as any).exitStatus,
      signal: (task as any).signal,

      startedBy: task.startedBy,
      automationId: task.automationId,
    },
    true
  );
}

post("startBuyers", async ({ body }) => {
  const { group, ids } = body;

  const tg = TaskGroupModel.findById(group);
  const tasks: BuyerTask[] = [];
  if (tg) {
    for (let id of ids) {
      if (!Buyer.hasRequestWithIdentifier(id)) {
        const task = tg.buyers.find((i) => i.id === id);

        if (task) {
          tasks.push(task);
        }
      }
    }

    Buyer.submitTasks(tasks);
  }
});

post("stopBuyers", ({ body }) => {
  const { ids } = body;
  Buyer.stopTasks(ids);
});

post("startMonitors", async ({ body }) => {
  const { group, ids } = body;

  const tg = TaskGroupModel.findById(group);
  const tasks: MonitorTask[] = [];
  if (tg) {
    for (let id of ids) {
      if (!Monitor.getWorkerWithId(id)) {
        const task = tg.monitors.find((m) => m.id === id);
        if (task) {
          tasks.push(task);
        }
      }
    }

    Monitor.submitTasks(tasks);
  }
});

post("stopMonitors", ({ body }) => {
  const { ids } = body;
  Monitor.removeTasksById(ids);
});

TaskGroupModel.on("save", async (tg) => {
  for (let buyer of tg.buyers) {
    buyer.group = tg;
    const w = Buyer.getWorkerWithId(buyer.id);
    if (w) {
      const old = w.task;

      w.task = buyer;

      w.task.proxyGroup = w.task.proxyGroup
        ? ProxyGroupModel.findById(w.task.proxyGroup.id)
        : undefined;

      w.task.proxy = old.proxy;
      w.task.product = old.product;
      w.task.start = old.start;
      w.task.isRunning = old.isRunning;
      w.task.account = old.account;
      w.task.startedBy = old.startedBy;
      w.task.automationId = old.automationId;

      const existing = Buyer.productCache.find(w.requestURL, w.task.monitor);
      if (existing) {
        const available = findVariantMatchingSizeAvailable(
          existing.variants,
          w.task.sizes,
          w.forceIgnoreAvailability
        );
        if (available) {
          w.productFulfilled(existing);
        }
      }

      w.onRequestUpdated();
    }
  }
  const toRestart: MonitorTask[] = [];
  for (let monitor of tg.monitors) {
    monitor.group = tg;
    const m = Monitor.getWorkerWithId(monitor.id);
    if (m) {
      const old = m.task;
      m.task = monitor;

      // delay or monitor change
      if (
        tg.store.platform === Platform.Shopify &&
        (m.task.monitor !== old.monitor ||
          m.task.delay !== old.delay ||
          m.task.group.storePassword !== old.group.storePassword ||
          m.task.group.store.url !== old.group.store.url)
      ) {
        Monitor.removeTasksById([m.task.id]);
        toRestart.push(m.task);
      } else {
        if (monitor.proxyGroup?.id === old.proxyGroup?.id) {
          m.task.proxyGroup = old.proxyGroup;
        }

        m.task.proxy = old.proxy;
        m.task.start = old.start;

        m.task.product = old.product;
        m.task.isRunning = old.isRunning;

        m.task.startedBy = old.startedBy;
        m.task.automationId = old.automationId;

        m.onRequestUpdated();
      }
    }
  }

  Monitor.submitTasks(toRestart);
});

post("quickMonitorChange", (req) => {
  let { group } = req.body;
  const tg = TaskGroupModel.findById(group);

  if (tg) {
    const theClipboard = formatProductURL(
      clipboard.readText("clipboard").trim()
    );
    for (let buyer of tg.buyers) {
      if (buyer.monitor === theClipboard) {
        continue;
      }

      buyer.monitor = theClipboard;

      queueGroupUpdate(buyer, "buyer");
    }
    const toRestart: MonitorTask[] = [];

    // 39248133193856
    for (let monitor of tg.monitors) {
      if (monitor.monitor === theClipboard) {
        continue;
      }

      monitor.product = undefined;
      monitor.monitor = theClipboard;
      const m = Monitor.getWorkerWithId(monitor.id);
      if (m) {
        Monitor.removeTasksById([monitor.id]);
        toRestart.push(monitor);
      }
      queueGroupUpdate(monitor, "monitor");
    }

    if (toRestart.length) {
      Monitor.submitTasks(toRestart);
    }

    queueUIUpdate(tg.id, "buyer");
    queueUIUpdate(tg.id, "monitor");
    tg.save();
  }
});
