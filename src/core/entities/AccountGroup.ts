import { BaseModel } from "./BaseModel";
import { StoreAccount } from "./StoreAccount";

export class AccountGroup extends BaseModel {
  name!: string;
  accounts: StoreAccount[] = [];
}
