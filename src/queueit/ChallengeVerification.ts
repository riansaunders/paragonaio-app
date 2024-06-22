export interface ChallengeVerification {
  isVerified: boolean;
  timestamp: string;
  sessionInfo: {
    sessionId: string;
    timestamp: string;
    sourceIp: string;
    challengeType: string;
    version: number;
  };
}
