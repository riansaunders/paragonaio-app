import { QueueItWorker } from "./QueueItWorker";
import { QueueItWorkerEvents } from "./QueueItWorkerEvents";

export type QueueItEvents = QueueItWorkerEvents & {
  workerRemoved: (worker: QueueItWorker) => void;
  workerAdded: (worker: QueueItWorker) => void;
};
