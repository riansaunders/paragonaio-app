import { cacheByFunction } from "@dal/DAL";
import { ModelDAL } from "@dal/ModelDAL";
import { BaseModel } from "@entities/BaseModel";
import { v4 } from "uuid";
import { transientMetadataKey, referencesMetaDataKey } from "./decorators";

export function getNameForObject(object: any): string {
  return new object().constructor.name;
}

export function generateID() {
  return v4();
}

const refCache = new Map<any, string>();

export function serialize(obj: any, withTransients: boolean = false) {
  const output: any = {};

  if (obj instanceof BaseModel && !obj["id"]) {
    obj["id"] = generateID();
  }

  if (
    typeof obj === "undefined" ||
    (typeof obj !== "object" && !Array.isArray(obj))
  ) {
    return obj;
  }

  for (let key of Object.keys(obj)) {
    const value = obj[key];

    if (typeof value === "undefined") {
      if (withTransients) {
        output[key] = value;
      }
      continue;
    }

    if (key === "_events" || key === "_eventsCount") {
      continue;
    }

    if (typeof value === "function") {
      continue;
    }
    const isTransient = Reflect.getMetadata(transientMetadataKey, obj, key);
    if (isTransient && !withTransients) {
      continue;
    }

    if (Array.isArray(value)) {
      output[key] = value.map((v) => serialize(v));
      continue;
    }

    const referenceToWho = Reflect.getMetadata(referencesMetaDataKey, obj, key);

    if (referenceToWho && value["id"]) {
      const [fnct, field] = referenceToWho;
      let name = refCache.get(fnct);

      if (!name) {
        const obj = fnct();

        refCache.set(fnct, (name = cacheByFunction(obj)));
      }
      output[key] = {
        id: value["id"],
        __reference: name,
        __referencePath: field,
      };
      continue;
    }

    if (typeof value === "object") {
      output[key] = serialize(value);
      continue;
    }
    output[key] = value;
  }

  return output;
}
