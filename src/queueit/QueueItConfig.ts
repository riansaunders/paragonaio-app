import { Task } from "@entities/Task";
import { CookieJar } from "tough-cookie";
import { TaskPage } from "../core/task-page";

export interface QueueItConfig {
  baseURL: string;

  userAgent: string;
  jar: CookieJar;

  // queue-it params
  c: string;
  e: string;
  t: string;
  cid: string;

  layoutName: string;
  layoutVersion: number;

  page: TaskPage;

  url: URL;

  userId: string;

  triggerUrl: string;
  task: Task;
}
