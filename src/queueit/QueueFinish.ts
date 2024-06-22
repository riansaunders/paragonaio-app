export type QueueFinish = {
  uuid: string;

  triggerUrl: string;
  queueUrl: string;
  storeUrl: string;
  redirectUrl: string;
  blocked?: boolean;
};
