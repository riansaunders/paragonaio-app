import * as Buyer from "@buyer/Buyer";
import * as Monitor from "@monitor/Monitor";

import { BuyerWorker } from "@buyer/worker/BuyerWorker";
import { productCompare } from "@core/cache/ProductCache";
import {
  formatProductURL,
  keywordMatches,
  keywords,
  negativeKeywords,
} from "@core/util/helpers";
import { AutomationModel, SettingsModel, TaskGroupModel } from "@dal/DAL";
import { BuyerTask } from "@entities/BuyerTask";
import { MonitorTask } from "@entities/MonitorTask";
import { Product } from "@entities/Product";
import { Task } from "@entities/Task";
import { MonitorWorker } from "@monitor/worker/MonitorWorker";
import { postAutomationNotification } from "./discord";
import { queueGroupUpdate, queueUIUpdate } from "./tasks";

type AutomationRequest = {
  storeUrl: string;
  monitor: string;
  title?: string;
  product?: Product;
};

Monitor.events.on("workerRemoved", (workers) => clearAutomationState(workers));
Buyer.events.on("workerRemoved", (workers) => clearAutomationState(workers));

function clearAutomationState(workers: BuyerWorker[] | MonitorWorker[]) {
  for (let worker of workers) {
    worker.task.startedBy = undefined;
    worker.task.automationId = undefined;
  }
}

Monitor.events.on("productUpdate", (_, s, p) => {
  const automation = AutomationModel.first();

  if (!automation || !automation.monitorStartEnabled) {
    return;
  }
  triggerAutomation({
    storeUrl: s,
    monitor: p.monitor,
    product: p,
  });
});

export function triggerAutomation({
  storeUrl,
  monitor: autoMonitor,
  title,
  product,
}: AutomationRequest) {
  const automation = AutomationModel.first();
  if (!automation || !automation.runtime) {
    return;
  }

  const keywordThatMatches = automation.monitors.find(
    (search) =>
      (title &&
        keywordMatches(title, keywords(search), negativeKeywords(search))) ||
      keywordMatches(autoMonitor, keywords(search), negativeKeywords(search))
  );
  if (
    (title && automation.monitors.includes(title)) ||
    automation.monitors.includes(autoMonitor) ||
    !!keywordThatMatches ||
    (product && automation.monitors.includes(product.id))
  ) {
    const groups = TaskGroupModel.all().filter((g) => g.store.url === storeUrl);
    autoMonitor = formatProductURL(autoMonitor);

    const query = (t: Task) =>
      (title && t.monitor === title) ||
      t.monitor === autoMonitor ||
      t.monitor === product?.url ||
      t.monitor === product?.id ||
      keywordMatches(
        autoMonitor,
        keywords(t.monitor),
        negativeKeywords(t.monitor)
      ) ||
      (title &&
        keywordMatches(
          title,
          keywords(t.monitor),
          negativeKeywords(t.monitor)
        )) ||
      (product && productCompare(product, t.monitor));

    const automationId = Date.now();
    const automatedBuyers: BuyerTask[] = [];
    const automatedMonitors: MonitorTask[] = [];
    const groupNames = [];

    for (let group of groups) {
      const monitors = group.monitors.filter(query);
      const buyers = group.buyers.filter(query).filter((t) => !t.isRunning);

      if (monitors.length && buyers.length) {
        monitors
          .filter((t) => !t.isRunning)
          .forEach(
            (m) => (
              (m.startedBy = "automation"), (m.automationId = automationId)
            )
          );
        buyers.forEach(
          (b) => (
            (b.startedBy = b.isRunning ? b.startedBy : "automation"),
            (b.automationId = automationId)
          )
        );

        Buyer.submitTasks(buyers);
        Monitor.submitTasks(monitors);

        automatedBuyers.push(...buyers);
        automatedMonitors.push(...monitors);
        groupNames.push(group.name);
      }
    }

    const runtime = automation.runtime * (1000 * 60);

    setTimeout(() => {
      const query = (t: Task) =>
        t.startedBy === "automation" && t.automationId === automationId;
      const buyers = automatedBuyers.filter(query);
      const monitors = automatedMonitors.filter(query);

      Buyer.stopTasks(buyers.map((t) => t.id));

      Monitor.removeTasksById(monitors.map((t) => t.id));

      [...buyers, ...monitors].forEach((t) => {
        t.isRunning = false;
        const updateType = t instanceof BuyerTask ? "buyer" : "monitor";
        queueGroupUpdate(t, updateType);
        queueUIUpdate(t.group.id, updateType);
      });
    }, runtime);

    const settings = SettingsModel.first();
    if (
      settings?.postAutomationToHook &&
      settings?.discordWebhook &&
      automatedBuyers.length
    ) {
      postAutomationNotification({
        webhookURL: settings.discordWebhook,
        storeName: storeUrl,
        groupNames: groupNames,
        monitor: autoMonitor,
        imageURL: product?.imageURL,
      });
    }
  }
}
