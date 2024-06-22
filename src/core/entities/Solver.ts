import { Any, WhereChallengeKey } from "@core/challenge/Challenge";
import { BaseModel } from "./BaseModel";
import { BasicProxy } from "./BasicProxy";
export enum SolverType {
  Manual,
  TwoCaptcha,
  CapMonster,
}

export class Solver extends BaseModel {
  name!: string;
  type!: SolverType;
  where?: WhereChallengeKey;
  key?: string;
  proxy?: BasicProxy;
}
