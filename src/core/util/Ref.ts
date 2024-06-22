import { BaseModel } from "@core/entities/BaseModel";

export type AnyObject = AnyParamConstructor<any>;
export type BaseModelObject = AnyParamConstructor<BaseModel>;

export type AnyParamConstructor<T> = new (...args: any) => T;

export type Ref<R extends BaseModel> = R;

export function solidReference<T extends BaseModel>(theRef: Ref<T>): T {
  return theRef as T;
}
