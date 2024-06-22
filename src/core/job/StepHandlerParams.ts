import {
  AddStepFunction,
  NextStepFunction,
  RetryStepFunction,
  SetContextFunction,
  StepErrorFunction,
} from "./JobFunctions";
import { TaskStep } from "./TaskStep";

export interface StepHandlerParams {
  next: NextStepFunction;
  retry: RetryStepFunction;
  error: StepErrorFunction;
  setContext: SetContextFunction;

  addAsyncStep: AddStepFunction;

  context: any;
  isFromRetry: boolean;
  retryCount: number;
  current: TaskStep;
  previousStep?: TaskStep;
}
