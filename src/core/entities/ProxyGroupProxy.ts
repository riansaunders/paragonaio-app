import { Transient } from "@core/util/decorators";
import { BasicProxy } from "./BasicProxy";

export class ProxyGroupProxy extends BasicProxy {
  @Transient()
  public usageCount?: number;

  increaseUsage() {
    this.usageCount = (this.usageCount ?? 0) + 1;
    console.log("Increase");
    console.log(this.proxyString, this.usageCount);

    // console.trace();
  }

  decreaseUsage() {
    this.usageCount = Math.min(0, (this.usageCount ?? 1) - 1);

    console.log("Decrease");
    console.log(this.proxyString, this.usageCount);
  }
}
