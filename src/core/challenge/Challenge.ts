import { Cookie } from "tough-cookie";

export const Any = "any";
export const ShopifyCheckpoint = "shopify-checkpoint";
export const ShopifyLogin = "shopify-login";
export const ShopifyQuestion = "shopify-question";
export const ShopifyCheckoutChallenge = "shopify-checkout";
export const DataDome = "datadome";
export const QueueItChallenge = "queue-it";

export const RecaptchaV2Checkbox = 0;
export const RecaptchaV2Invisible = 1;
export const RecaptchaV3Score = 2;
export const HCaptchaCheckbox = 3;
export const HCaptchaInvisible = 4;
export const GeeTest = 5;
export const RecaptchaV3Enterprise = 6;
export const Question = 7;

export interface ChallengeRequest {
  id: string;
  where: WhereChallengeKey;
  version: TypeOfChallengeKey;
  url: string;

  userAgent?: string;

  action?: string;

  html?: string;

  cookies?: Cookie[];
  siteKey: string;

  geetest_ApiServer?: string;
  geetest_GT?: string;
  geetest_Challenge?: string;
}

export interface RecaptchaChallengeResponse {
  token: string;
  html?: string;
}

export interface HCaptchaChallengeResponse {
  recaptcha: string;
  hcaptcha: string;
  token: string;
  data: string;

  html?: string;
}

export interface DataDomeChallengeResponse {
  checkURL?: string;

  geetest_challenge?: string;
  geetest_validate?: string;
  geetest_seccode?: string;
}

export interface QuestionResponse {
  answer: string;
}

export type ChallengeResponse =
  | RecaptchaChallengeResponse
  | HCaptchaChallengeResponse
  | DataDomeChallengeResponse
  | QuestionResponse;

export type TypeOfChallengeKey =
  | typeof RecaptchaV2Checkbox
  | typeof RecaptchaV2Invisible
  | typeof RecaptchaV3Score
  | typeof HCaptchaCheckbox
  | typeof HCaptchaInvisible
  | typeof GeeTest
  | typeof RecaptchaV3Enterprise
  | typeof Question;

export type WhereChallengeKey =
  | typeof Any
  | typeof ShopifyCheckpoint
  | typeof ShopifyLogin
  | typeof ShopifyQuestion
  | typeof ShopifyCheckoutChallenge
  | typeof DataDome
  | typeof QueueItChallenge;
