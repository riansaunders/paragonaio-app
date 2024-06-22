import { AnyObject, BaseModelObject } from "./Ref";

export const transientMetadataKey = Symbol("transient");
export const referencesMetaDataKey = Symbol("references");
export const instantiateMetaDataKey = Symbol("instantiates");

export function Transient() {
  return Reflect.metadata(transientMetadataKey, true);
}

export function Instantiate<T extends AnyObject>(whatIsItfnction: () => T) {
  return Reflect.metadata(instantiateMetaDataKey, whatIsItfnction);
}

export function References<T extends BaseModelObject>(
  whereIsItFnction: () => T,
  path?: string
) {
  return Reflect.metadata(referencesMetaDataKey, [whereIsItFnction, path]);
}
