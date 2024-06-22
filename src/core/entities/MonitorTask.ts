import { Task } from "./Task";

export class MonitorTask extends Task {
  delay!: number;

  sizes: string[] = [];
}
