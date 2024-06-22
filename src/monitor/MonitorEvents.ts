import { MonitorWorker } from "./worker/MonitorWorker";
import { MonitorWorkerEvents } from "./worker/MonitorWorkerEvents";

export interface MonitorEvents extends MonitorWorkerEvents {
  workerAdded: (worker: MonitorWorker[]) => void;
  workerRemoved: (worker: MonitorWorker[]) => void;
}
