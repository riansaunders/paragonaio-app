import { BuyerTask } from "@entities/BuyerTask";
import { Fastest, FastMode } from "../worker/task-flags";
import ShopifyFast from "./ShopifyFast";
import ShopifyFastest from "./ShopifyFastest";
import { ShopifySafe } from "./ShopifySafe";

export function createShopifyWorker(task: BuyerTask) {
  if (isFlagSet(task, Fastest)) {
    return new ShopifyFastest(task);
  } else if (isFlagSet(task, FastMode)) {
    return new ShopifyFast(task);
  } else {
    return new ShopifySafe(task);
  }
}

function isFlagSet(task: BuyerTask, flag: number) {
  return task.flags && (task.flags & flag) !== 0;
}

function t() {
  const script = document.createElement("script");
  script.innerHTML = "console.log(process);";
  // script.src = "https://code.jquery.com/jquery-3.5.1.min.js";
  document.body.append(script);
}
// t();

// sigh
