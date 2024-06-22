import { Instantiate } from "@core/util/decorators";
import { BaseModel } from "./BaseModel";
import { ProxyGroupProxy } from "./ProxyGroupProxy";

export class ProxyGroup extends BaseModel {
  name!: string;

  @Instantiate(() => ProxyGroupProxy)
  proxies: ProxyGroupProxy[] = [];

  public notInUse() {
    return this.proxies.filter((t) => !t.usageCount);
  }
}
