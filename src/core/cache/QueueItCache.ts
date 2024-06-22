import { QueueItUser } from "@queueit/QueueItUser";
import { TypedEmitter } from "tiny-typed-emitter";
import { v4 } from "uuid";
import { CacheEvents } from "./CacheEvents";

export class QueueItCache extends TypedEmitter<CacheEvents<QueueItUser>> {
  users: QueueItUser[] = [];

  public update(f: QueueItUser) {
    let existing = this.find(f.triggerUrl);

    if (existing) {
      existing.uuid = v4();
      existing.cookies = existing.cookies.concat(...f.cookies);
    } else {
      this.users.push(f);
    }
    this.emit("itemUpdated", f);
  }

  public find(triggerUrl: string): QueueItUser | undefined {
    for (let p of this.users) {
      if (p.triggerUrl === triggerUrl) {
        return p;
      }
    }
    return undefined;
  }
}
