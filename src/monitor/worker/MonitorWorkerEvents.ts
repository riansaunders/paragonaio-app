import { Product } from "@entities/Product";
import { QueueFinish } from "@queueit/QueueFinish";
import { QueueFinishRequest } from "@queueit/QueueFinishRequest";
import { QueueItUser } from "@queueit/QueueItUser";
import { MonitorWorker } from "./MonitorWorker";

export interface MonitorWorkerEvents {
  productUpdate: (
    task: MonitorWorker,
    storeUrl: string,
    product: Product
  ) => void;

  shutdown: (worker: MonitorWorker) => void;
  taskShouldUpdate: (task: MonitorWorker) => void;

  proxyRotateRequest: (task: MonitorWorker) => void;
  proxyRotateCompleted: () => void;

  queueitUserRequest: (worker: MonitorWorker, triggerUrl: string) => void;
  queueitUserFulfilled: (user?: QueueItUser) => void;

  queueitRequest: (worker: MonitorWorker, req: QueueFinishRequest) => void;
  queueitFulfilled: (user?: QueueFinish) => void;
  queueitPassed: (worker: MonitorWorker, triggerUrl: string) => void;
}
