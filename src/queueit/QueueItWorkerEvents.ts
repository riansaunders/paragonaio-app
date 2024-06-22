import { ChallengeRequest, ChallengeResponse } from "@core/challenge/Challenge";
import { MessageType } from "@entities/MessageType";
import { QueueFinish } from "./QueueFinish";
import { QueueItWorker } from "./QueueItWorker";

export interface QueueItWorkerEvents {
  log: (what: string) => void;
  progressUpdate: (progress: number) => void;
  queueComplete: (details: QueueFinish) => void;

  cancelChallenge: (worker: QueueItWorker) => void;
  challengeRequest: (worker: QueueItWorker, request: ChallengeRequest) => void;
  challengeFulfilled: (answer: ChallengeResponse) => void;

  statusUpdate: (message: string, type?: MessageType) => void;
  sessionStarted: (event: string) => void;

  otherSessionStarted: (event: string) => void;
}
