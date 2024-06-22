import { BaseModel } from "./BaseModel";

export class UserSettings extends BaseModel {
  discordWebhook?: string;
  postDeclinesToHook?: boolean;
  postAutomationToHook?: boolean;
  postCartsToHook?: boolean;

  autoSolveAccessToken?: string;
  autoSolveApiKey?: string;
  autoSolveQueueIt?: boolean;

  thirdPartyQueueIt?: boolean;

  declineSound?: boolean;
}
