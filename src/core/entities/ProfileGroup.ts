import { Instantiate } from "@core/util/decorators";
import { BaseModel } from "./BaseModel";
import { Profile } from "./Profile";

export class ProfileGroup extends BaseModel {
  name!: string;

  @Instantiate(() => Profile)
  profiles: Profile[] = [];
}
