import { Instantiate } from "@core/util/decorators";
import { TypedEmitter } from "tiny-typed-emitter";
import { BaseModel } from "./BaseModel";
import { BuyerTask } from "./BuyerTask";
import { MonitorTask } from "./MonitorTask";
import { Store } from "./Store";

type TaskGroupEvents = {
  taskShouldUpdate: () => void;
};

export class TaskGroup extends BaseModel {
  events: TypedEmitter<TaskGroupEvents> = new TypedEmitter();

  name!: string;
  store!: Store;
  singleCheckout?: boolean;

  retryDelay!: number;
  timeout!: number;

  storePassword?: string;

  @Instantiate(() => BuyerTask)
  buyers: BuyerTask[] = [];

  @Instantiate(() => MonitorTask)
  monitors: MonitorTask[] = [];

  public addBuyerTask(task: BuyerTask) {
    this.buyers = this.buyers.concat(task);
    task.group = this;
  }

  public addMonitor(task: MonitorTask) {
    this.monitors = this.monitors.concat(task);
    task.group = this;
  }
}
