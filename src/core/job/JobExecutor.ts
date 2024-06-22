import { TypedEmitter } from "tiny-typed-emitter";
import { JobExecutorEvents } from "./JobExecutorEvents";
import { StepHandlerParams } from "./StepHandlerParams";
import { StepContainer } from "./JobFunctions";
import { TaskStep } from "./TaskStep";

export interface JobExecutorOptions {
  delayModifier: (delay: number, error?: Error) => number;
}

export class JobExecutor extends TypedEmitter<JobExecutorEvents> {
  currentStepIdx: number = 0;
  previousStep?: TaskStep;
  stepHandlers: StepContainer[] = [];
  context: any;
  isShutdown: boolean = false;
  protected options?: JobExecutorOptions;

  constructor(public retryingDelay: number, options?: JobExecutorOptions) {
    super();
    this.options = options;
  }

  shutdown() {
    this.isShutdown = true;
  }

  public async addStep(
    step: TaskStep,
    handler: (params: StepHandlerParams) => Promise<TaskStep>
  ) {
    const theNextStep = {
      step: step,
      handle: handler,
    };

    // add it to our list
    this.stepHandlers.push(theNextStep);
  }

  protected async goToNextStep(): Promise<TaskStep> {
    this.previousStep = this.stepHandlers[this.currentStepIdx].step;
    this.currentStepIdx = this.currentStepIdx + 1;
    this.emit("willProgressStep");

    return await this.workOnCurrentStep();
  }

  isFinished() {
    return this.currentStepIdx >= this.stepHandlers.length;
  }

  async workOnCurrentStep(
    isFromRetry: boolean = false,
    retryCount: number = 0,
    error?: Error
  ): Promise<TaskStep> {
    const container = this.stepHandlers[this.currentStepIdx];
    if (this.isShutdown) {
      return Promise.resolve(TaskStep.Error);
    }
    if (!container) {
      return Promise.resolve(TaskStep.Complete);
    }
    this.emit("willStartStep", retryCount);

    if (isFromRetry) {
      this.emit("willRetryStep", retryCount, error);
    }

    return await container
      .handle({
        setContext: (context) => {
          this.context = context;
        },

        addAsyncStep: (step, handler) => {
          if (!container.executor) {
            container.executor = new AsyncJobExecutor(
              this.retryingDelay,
              this.options
            );
          }
          container.executor!.addStep(step, handler);
        },

        next: async (step, delay) => {
          // it has steps that have been added
          if (container.executor && !container.executor.isFinished()) {
            await container.executor.workOnCurrentStep();
          }

          if (step && delay) {
            return await this.goToStepWithDelay(step, delay);
          }
          if (step) {
            return await this.goToStep(step);
          }
          return await this.goToNextStep();
        },

        retry: async (delay) => {
          return await this.retryStep(delay, retryCount + 1);
        },
        error: async (message) => {
          return await this.stepError(message);
        },

        context: this.context,
        isFromRetry: isFromRetry,
        retryCount: retryCount,
        previousStep: this.previousStep,
        current: container.step,
      })
      .catch((e) => {
        this.emit("stepThrewError", e);
        // console.error(e);
        const delay = this.options
          ? this.options.delayModifier(this.retryingDelay, e)
          : this.retryingDelay;

        return this.retryStep(delay, retryCount + 1, e);
      });
  }

  protected getStepIndex(step: TaskStep) {
    const idx = this.stepHandlers.findIndex((h) => h.step === step);
    return idx;
  }

  protected async goToStep(step: TaskStep) {
    this.previousStep = this.stepHandlers[this.currentStepIdx].step;
    this.currentStepIdx = this.getStepIndex(step);
    return await this.workOnCurrentStep();
  }

  protected modifyDelay(delay: number, error?: Error) {
    return this.options ? this.options.delayModifier(delay, error) : delay;
  }

  protected async retryStep(
    timeout: number,
    retryCount?: number,
    error?: Error
  ): Promise<TaskStep> {
    return await new Promise((resolve) => {
      timeout = this.modifyDelay(timeout);
      setTimeout(
        async () =>
          resolve(await this.workOnCurrentStep(true, retryCount, error)),
        timeout
      );
    });
  }

  protected async goToStepWithDelay(
    step: TaskStep,
    delay: number
  ): Promise<TaskStep> {
    return await new Promise((resolve) => {
      delay = this.modifyDelay(delay);

      setTimeout(async () => resolve(await this.goToStep(step)), delay);
    });
  }

  protected stepError(message: string): Promise<TaskStep> {
    this.emit("finishedWithError", message);
    return Promise.resolve(TaskStep.Error);
  }
}
export class AsyncJobExecutor extends JobExecutor {
  finished: boolean = false;
  constructor(public retryingDelay: number, options?: JobExecutorOptions) {
    super(retryingDelay, options);
  }

  private makeParams(
    container: StepContainer,
    onComplete: () => void
  ): StepHandlerParams {
    return {
      setContext: (context) => {
        this.context = context;
      },

      addAsyncStep: (step, handler) => {
        if (!container.executor) {
          container.executor = new AsyncJobExecutor(
            this.retryingDelay,
            this.options
          );
        }
        container.executor.addStep(step, handler);
      },

      next: async () => {
        // it has steps that have been added
        if (container.executor && !container.executor.isFinished()) {
          await container.executor.workOnCurrentStep();
        }
        onComplete();
        return TaskStep.Complete;
      },

      retry: async (delay) => {
        return await new Promise((resolve) => {
          const timeout = this.modifyDelay(delay);
          container.retryCount = container.retryCount
            ? container.retryCount + 1
            : 1;
          setTimeout(
            async () =>
              resolve(
                await container.handle(this.makeParams(container, onComplete))
              ),
            timeout
          );
        });
      },
      error: async (message) => {
        onComplete();
        return await this.stepError(message);
      },

      context: this.context,
      isFromRetry: container.retryCount ? true : false,
      retryCount: container.retryCount || 0,
      previousStep: this.previousStep,
      current: container.step,
    };
  }

  isFinished(): boolean {
    return this.finished;
  }

  shutdown() {
    super.shutdown();
    this.finished = true;
  }

  async workOnCurrentStep(): Promise<TaskStep> {
    const promises: Promise<any>[] = [];

    for (let container of this.stepHandlers) {
      promises.push(
        new Promise(async (resolve) => {
          const onComplete = () => resolve(TaskStep.Complete);

          const goHandler = async () => {
            if (this.isShutdown || this.isFinished()) {
              resolve(TaskStep.Complete);
              return;
            }
            try {
              await container.handle(this.makeParams(container, onComplete));
            } catch (e: any) {
              console.log("Async errror");
              this.emit("stepThrewError", e);
              setTimeout(
                async () => resolve(await goHandler()),
                this.modifyDelay(this.retryingDelay, e)
              );
            }
          };
          await goHandler();
        })
      );
    }

    await Promise.all(promises);
    this.finished = true;
    return TaskStep.Complete;
  }
}
