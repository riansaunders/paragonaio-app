export interface QueueDetails {
  challengeFailed: boolean;
  customDataUniqueKeyViolation: boolean;
  invalidQueueitEnqueueToken: boolean;
  missingCustomDataKey: boolean;
  queueId?: string;
  redirectUrl?: string;
  serverIsBusy: boolean;
}
