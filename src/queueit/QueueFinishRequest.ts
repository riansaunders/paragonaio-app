import { TaskPage } from "@core/task-page";

export type QueueFinishRequest = {
  page: TaskPage;
  triggerUrl: string;
};
