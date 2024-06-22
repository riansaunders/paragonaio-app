import * as Buyer from "@buyer/Buyer";
import { CachedProduct } from "@core/cache/ProductCache";
import { Product } from "@entities/Product";
import { QueueFinish } from "@queueit/QueueFinish";
import * as QueueIt from "@queueit/QueueIt";
import { QueueItUser } from "@queueit/QueueItUser";
import Ably from "ably";
import { app } from "electron";
import { apiEndpoint } from "../core/config";
import { triggerAutomation } from "./automation";
import { signOut } from "./main";

Buyer.events.on("checkoutComplete", (w, success) => {
  const { product } = w.task;
  const p = product?.product!;
  if (success) {
    sendMessage({
      op: "automate",
      m: p.monitor ?? p.title,
      s: w.task.group.store.url,
      p: p,
    });
  }
});

let ably: Ably.Realtime;

type ProductAvailableMessage = {
  op: "product";
  p: CachedProduct;
};

type AutomateMessage = {
  op: "automate";
  m: string;
  s: string;
  t?: string;
  p?: Product;
};

type QueueItUserMessage = {
  op: "queueuser";
  u: QueueItUser;
};

type SignoutMessage = {
  op: "signout";
};

type CloudMessage =
  | AutomateMessage
  | QueueItUserMessage
  | ProductAvailableMessage
  | SignoutMessage;

export function init(authJWT: string) {
  ably = new Ably.Realtime({
    echoMessages: false,
    authCallback: (data, cb) => {
      ably.auth.requestToken(
        data,
        {
          authUrl: apiEndpoint.concat("/ablyAuth"),
          authHeaders: {
            authorization: authJWT,
          },
          authParams: {
            version: app.getVersion(),
          },
        },
        (err, token) => {
          if (err?.statusCode === 403 || err?.statusCode === 401) {
            signOut();
          }
          if (err) {
            cb(err, "");
          } else {
            cb("", token!);
          }
        }
      );
    },
  });

  const channel = ably.channels.get("paragonaio");
  channel.subscribe(
    (msg) => {
      const vm = msg.data as CloudMessage;
      // If I sent it, don't listen to it.
      if (msg.clientId === ably.auth.clientId || !vm) {
        return;
      }
      if (vm.op === "automate") {
        const product: Product | undefined = vm.p;
        if (product) {
          Buyer.productCache.update(vm.s, product);
        }
        triggerAutomation({
          storeUrl: vm.s,
          monitor: vm.m,
          title: vm.t,
          product: vm.p,
        });
      } else if (vm.op === "product") {
        const p: CachedProduct = vm.p;

        if (!Buyer.productCache.find(p.storeUrl, p.id)) {
          Buyer.productCache.update(p.storeUrl, p);
        }
      } else if (vm.op === "queueuser") {
        const u: QueueItUser = vm.u;
        QueueIt.userCache.update(u);
      } else if (vm.op === "signout") {
        signOut();
      }
    },
    () => {},
    (err) => {}
  );
}

export function unsubscribe() {
  ably?.close();
}

export function sendMessage(msg: Exclude<CloudMessage, SignoutMessage>) {
  if (!ably) {
    return;
  }
  const channel = ably.channels.get("paragonaio");
  channel.publish("client", msg);
}
