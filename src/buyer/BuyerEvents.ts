import { BuyerWorker } from "./worker/BuyerWorker";
import { BuyerWorkerEvents } from "./worker/BuyerWorkerEvents";

export interface BuyerEvents extends BuyerWorkerEvents {
  workerAdded: (worker: BuyerWorker[]) => void;
  workerRemoved: (worker: BuyerWorker[]) => void;
  allWorkersRemoved: () => void;
}
