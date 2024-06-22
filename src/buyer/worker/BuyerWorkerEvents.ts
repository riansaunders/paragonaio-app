import { MessageType } from "@entities/MessageType";
import { Product } from "@entities/Product";
import { QueueFinish } from "@queueit/QueueFinish";
import { QueueFinishRequest } from "@queueit/QueueFinishRequest";
import { QueueItUser } from "@queueit/QueueItUser";
import {
  ChallengeRequest,
  ChallengeResponse as ChallengeResponseType,
} from "../../core/challenge/Challenge";
import { BuyerWorker } from "./BuyerWorker";

export interface BuyerWorkerEvents {
  retryChallengeRequest: () => void;

  cancelChallenge: (worker: BuyerWorker) => void;
  challengeRequest: (worker: BuyerWorker, request: ChallengeRequest) => void;
  challengeCompleted: (answer: ChallengeResponseType) => void;

  proxyRotateRequest: (worker: BuyerWorker) => void;
  proxyRotateCompleted: () => void;

  logUpdate: (worker: BuyerWorker, message: string, type: MessageType) => void;

  queueitUserRequest: (worker: BuyerWorker, triggerUrl: string) => void;
  queueitUserFulfilled: (user?: QueueItUser) => void;
  queueitPassed: (worker: BuyerWorker, triggerUrl: string) => void;

  queueitRequest: (worker: BuyerWorker, req: QueueFinishRequest) => void;
  queueitFulfilled: (fulfilled?: QueueFinish) => void;

  productRequest: (worker: BuyerWorker) => void;
  productFulfilled: (product: Product) => void;

  checkoutComplete: (worker: BuyerWorker, success: boolean) => void;

  taskShouldUpdate: (worker: BuyerWorker) => void;

  shutdown?: (worker: BuyerWorker) => void;
}
