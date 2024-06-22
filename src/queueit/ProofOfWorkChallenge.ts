export interface ProofOfWorkChallenge {
  function: string;
  meta: string;
  parameters: {
    input: string;
    zeroCount: number;
  };
  sessionId: string;
}
