export interface TaskRuntime {
  storeUrl: string;
  exitStatus?: string;
  startedBy?: string;
  logs: string[];
}
