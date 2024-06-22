import { JobExecutor } from "./JobExecutor";
import { StepHandlerParams } from "./StepHandlerParams";
import { TaskStep } from "./TaskStep";

export type NextStepFunction = (
  step?: TaskStep,
  delay?: number
) => Promise<TaskStep>;

export type RetryStepFunction = (delay: number) => Promise<TaskStep>;

export type StepErrorFunction = (statusCode: string) => Promise<TaskStep>;

export type SetContextFunction = (context: any) => void;

export type AddStepFunction = (
  step: TaskStep,
  handler: (params: StepHandlerParams) => Promise<TaskStep>
) => void;

export interface StepContainer {
  retryCount?: number;
  step: TaskStep;
  executor?: JobExecutor;
  handle: (params: StepHandlerParams) => Promise<TaskStep>;
}
