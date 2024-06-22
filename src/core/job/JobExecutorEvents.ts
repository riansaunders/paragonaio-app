export interface JobExecutorEvents {
  willProgressStep: () => void;
  willStartStep: (retryCount: number) => void;
  willRetryStep: (retryCount: number, error?: Error) => void;

  finishedWithError: (message: string) => void;

  stepThrewError: (error: Error | any) => void;
}
