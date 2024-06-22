import { encryptionKey, isProd } from "@core/config";
import { ProfileGroup } from "@core/entities/ProfileGroup";
import {
  instantiateMetaDataKey,
  transientMetadataKey,
} from "@core/util/decorators";
import { BaseModelObject } from "@core/util/Ref";
import { getNameForObject, serialize } from "@core/util/serial";
import { AccountGroup } from "@entities/AccountGroup";
import { Automation } from "@entities/Automation";
import { CompletedBuyer } from "@entities/CompletedBuyer";

import { ProxyGroup } from "@entities/ProxyGroup";
import { Solver } from "@entities/Solver";
import { TaskGroup } from "@entities/TaskGroup";
import { UserSettings } from "@entities/UserSettings";
import ElectronStore from "electron-store";
import { ModelDAL } from "./ModelDAL";

type AccessModel = {
  save: () => void;
  delete: () => void;
  duplicate: <T>() => T;
};

export type ReturnModelType<U extends BaseModelObject> = AccessModel &
  InstanceType<U>;

export type Record = BaseModelObject;

export class RecordHolder<T extends BaseModelObject> {
  records!: T[];
}

const modelDalCache = new Map<string, ModelDAL<any>>();

export function deserialize(from: any, to: any) {
  if (!from || typeof from !== "object") {
    return from;
  }
  for (let key in from) {
    const isTransient = Reflect.getMetadata(transientMetadataKey, to, key);
    const value = from[key];

    if (isTransient) {
      to[key] = undefined;
      delete from[key];

      continue;
    }

    const instantiate = Reflect.getMetadata(instantiateMetaDataKey, to, key);

    if (Array.isArray(value)) {
      to[key] = value.map((x, idx) => {
        if (instantiate) {
          const fn = instantiate();
          const v = new fn();
          for (let key of Object.keys(value[idx])) {
            v[key] = value[idx][key];
          }
          return deserialize(x, v);
        }

        return deserialize(x, value[idx]);
      });
      continue;
    } else if (typeof value === "object" && value["id"]) {
      const id = value["id"];
      const reference = value["__reference"];
      const field = value["__referencePath"];

      if (reference) {
        const model = modelDalCache.get(reference);

        if (model) {
          if (!field) {
            to[key] = model.findById(id);
          } else {
            for (let x of model.all()) {
              const a = x[field];
              if (a && Array.isArray(a)) {
                for (let o of a) {
                  if (o["id"] === id) {
                    delete value["__reference"];
                    delete value["__referencePath"];
                    to[key] = o;
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }

    if (instantiate) {
      const fn = instantiate();
      const v = new fn();
      for (let key of Object.keys(value)) {
        v[key] = value[key];
      }
      from[key] = deserialize(v, from[key]);
    } else {
      from[key] = deserialize(value, from[key]);
    }
    to[key] = to[key] ?? from[key];
  }
  return to;
}
export function getDALForModel<T extends BaseModelObject>(
  what: T,
  fileName?: string,
  encryptionKey?: string
): ModelDAL<T> {
  fileName = fileName ?? getNameForObject(what);
  const existing = modelDalCache.get(fileName);

  if (existing) {
    return existing;
  } else {
    const out = new ModelDAL(what, fileName);
    modelDalCache.set(fileName, out);

    const store = new ElectronStore<RecordHolder<T>>({
      name: fileName,
      encryptionKey: isProd ? encryptionKey : undefined,
      serialize: (_) => {
        if (!out.ready()) {
          return JSON.stringify({});
        }

        let holder = {
          records: out.all().map((r) => serialize(r)),
        };

        const x = JSON.stringify(holder, null, "\t");

        return x;
      },
      deserialize: (json) => {
        const joy = new RecordHolder<T>();
        const c = JSON.parse(json);
        joy.records = c.records;

        const field = c.records || [];
        for (let i = 0; i < field.length; i++) {
          const entry = field[i] as any;
          if (Array.isArray(entry)) {
            const ol = new what();
            c["records"][i] = entry.map((x, i) => deserialize(entry[i], ol));
          } else {
            c["records"][i] = deserialize(entry, new what());
          }
        }
        return joy;
      },
    });

    out.init(store);
    // const out = new ModelDAL(what, store);
    return out;
  }
}

export const SettingsModel = getDALForModel(UserSettings, "UserSettings");
export const SolverModel = getDALForModel(Solver, "Solver");
export const TaskGroupModel = getDALForModel(TaskGroup, "TaskGroup");
export const AutomationModel = getDALForModel(Automation, "Automation");
export const AccountGroupModel = getDALForModel(AccountGroup, "AccountGroup");
export const CompletedBuyerModel = getDALForModel(
  CompletedBuyer,
  "CompletedBuyer"
);
export const ProfileGroupModel = getDALForModel(
  ProfileGroup,
  "ProfileGroup",
  encryptionKey
);
export const ProxyGroupModel = getDALForModel(ProxyGroup, "ProxyGroup");

export function cacheByFunction(fnct: any) {
  for (let key of Array.from(modelDalCache.keys())) {
    const item = modelDalCache.get(key)?.whatToMake;

    if (item === fnct) {
      return key;
    }
  }
  return String(fnct);
}

export function getLoadedModels() {
  const vals = Array.from(modelDalCache.values());
  return vals;
}

export function completeLoading() {
  const keys = Array.from(modelDalCache.keys());
  for (let key of keys) {
    const dal = modelDalCache.get(key);
    dal?.deserializeAll();
  }
}

completeLoading();
