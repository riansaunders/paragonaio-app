export interface QueueStatus {
  ticket?: {
    progress: number;
    // date string
    eventStartTimeUTC: string;
  };
  isBeforeOrIdle?: boolean;
  redirectUrl?: string;
  updateInterval?: number;
  forcaseStatus?: "FirstInLine" | "InLine" | "NotReadyYet" | "NotInQueuePhase";
}
