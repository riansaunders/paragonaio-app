import { References, Transient } from "@core/util/decorators";
import { Ref } from "@core/util/Ref";
import { AccountGroup } from "./AccountGroup";
import { Profile } from "./Profile";
import { ProfileGroup } from "./ProfileGroup";
import { StoreAccount } from "./StoreAccount";
import { Task } from "./Task";
export class BuyerTask extends Task {
  @References(() => AccountGroup)
  accountGroup?: Ref<AccountGroup>;

  @References(() => ProfileGroup, "profiles")
  profile!: Ref<Profile>;

  @References(() => AccountGroup, "accounts")
  account?: Ref<StoreAccount>;

  flags: number = 0;

  shippingRate?: string;

  signal?: string;

  @Transient()
  exitStatus?: "checkout" | "decline";
}
