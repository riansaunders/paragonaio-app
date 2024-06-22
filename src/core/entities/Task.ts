import { Instantiate, References, Transient } from "@core/util/decorators";
import { isRandomSize } from "@core/util/helpers";
import { Ref } from "@core/util/Ref";
import { MessageType } from "@entities/MessageType";
import { BaseModel } from "./BaseModel";
import { ProductDetails } from "./ProductDetails";
import { ProxyGroup } from "./ProxyGroup";
import { ProxyGroupProxy } from "./ProxyGroupProxy";
import { TaskGroup } from "./TaskGroup";

export class Task extends BaseModel {
  @References(() => TaskGroup)
  group!: Ref<TaskGroup>;

  @References(() => ProxyGroup)
  proxyGroup?: Ref<ProxyGroup>;

  monitor!: string;

  sizes: string[] = [];

  @Transient()
  proxy?: ProxyGroupProxy;

  @Transient()
  isRunning: boolean = false;

  @Transient()
  message?: TaskLog;

  @Transient()
  product?: ProductDetails;

  @Transient()
  start?: Date;

  @Transient()
  startedBy?: "automation" | "manual";

  @Transient()
  automationId?: number;

  isRandomSize() {
    return isRandomSize(this.sizes);
  }
}

export interface TaskLog {
  message: string;
  type: MessageType;
}
