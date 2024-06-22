import { BaseModel } from "./BaseModel";

export class Automation extends BaseModel {
  monitors!: string[];
  // in minutes
  runtime!: number;
  monitorStartEnabled?: boolean;
}
