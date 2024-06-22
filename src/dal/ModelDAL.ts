import { AnyObject } from "@core/util/Ref";
import { generateID } from "@core/util/serial";
import ElectronStore from "electron-store";
import { TypedEmitter } from "tiny-typed-emitter";
import { deserialize, RecordHolder, ReturnModelType } from "./DAL";

export type Model<T extends AnyObject> = ReturnModelType<T>;

type DALEvents<T extends AnyObject> = {
  rearrange: (source: number, destination: number) => void;
  save: (what: ReturnModelType<T>) => void;
  remove: (what: ReturnModelType<T>) => void;
};

export class ModelDAL<T extends AnyObject> extends TypedEmitter<DALEvents<T>> {
  private records: ReturnModelType<T>[] = [];

  private _store?: ElectronStore<RecordHolder<T>>;
  name: string;

  private get store() {
    return this._store!;
  }
  constructor(
    public whatToMake: T,
    name: string,
    _store?: ElectronStore<RecordHolder<T>>
  ) {
    super();
    this.name = name;
    if (_store) {
      this.init(_store);
    }
  }

  init(store: ElectronStore<RecordHolder<T>>) {
    this._store = store;
    this.records = this.fix((store.store.records as any[]) || []);
  }

  ready() {
    return !!this.store;
  }

  _rearrange(source: number, destination: number) {
    const items = Array.from(this.records);
    const [reorderedItem] = items.splice(source, 1);

    items.splice(destination, 0, reorderedItem);

    this.records = items;
  }

  rearrange(source: number, destination: number) {
    this._rearrange(source, destination);
  }

  create(object?: Partial<InstanceType<T>>): ReturnModelType<T> {
    const output = new this.whatToMake();

    if (object) {
      for (let key in object) {
        output[key] = object[key];
      }
    }

    if (!output["id"]) {
      output["id"] = generateID();
    }

    return this.applyAccessModel(output);
  }

  applyAccessModel(object: any) {
    object["save"] = async () => this.save(object);
    object["delete"] = () => this.findByIdAndRemove(object["id"]);
    object["duplicate"] = () => {
      const obj = this.create(object);
      obj.id = generateID();
      return obj;
    };
    return object;
  }

  async replaceOrCreate(id: string, what: Partial<InstanceType<T>>) {
    const x = new this.whatToMake();
    deserialize(what, x);

    // const merge = (from: any, to: any) =>
    const existing = this.findById(id);
    if (existing) {
      for (let key of Object.keys(x)) {
        const ev = existing[key];
        const nv = x[key];
        if (nv !== ev) {
          existing[key] = nv;
        }
      }
    }

    this.applyAccessModel(x);
    return this.save(x);
  }

  _addOrReplace(record: InstanceType<T>) {
    const has = this.findById(record["id"]);
    this.records = has
      ? this.records.map((r: any) => (r["id"] === record["id"] ? record : r))
      : this.records.concat(record);
  }

  async save(record: InstanceType<T>) {
    const isRenderer = process.type === "renderer";
    if (!record["id"]) {
      record["id"] = generateID();
    }

    this._addOrReplace(record);
    if (!isRenderer) {
      this.store.set("records", this.records);
      this.emit("save", record);
      if (record.emit) {
        record.emit("save");
      }
    }
  }

  public findById(id: string) {
    for (let record of this.records) {
      if (record && record.id === id) {
        return record;
      }
    }
  }

  public findByIdAndRemove(id: string) {
    const record = this.records.find((r) => r["id"] == id);
    if (record) {
      this.remove(record);
    }
  }

  public firstOrCreate(object?: Partial<InstanceType<T>>) {
    return this.first() ?? this.create(object);
  }

  public first(): ReturnModelType<T> | undefined {
    return this.records[0];
  }

  public last(): ReturnModelType<T> | undefined {
    return this.records[this.records.length - 1];
  }

  public getPath() {
    return this._store?.path;
  }

  _remove(record: T) {
    const filtered = this.records.filter(
      (r) => r["id"] !== (record as any)["id"]
    );
    this.records = filtered;
  }

  public remove(record: T) {
    const isRenderer = process.type === "renderer";
    this._remove(record);
    if (!isRenderer) {
      this.store.set("records", this.records);

      const an = record as any;
      if (an.emit) {
        an.emit("delete");
      }
      // @ts-expect-error
      this.emit("remove", record);
    }
  }

  // public removeMany(records: T[]) {
  //   const ids = records.map((r: any) => r["id"]);
  //   const filtered = this.records.filter((r) => !ids.includes(r["id"]));

  //   this.records
  //     .filter((r) => ids.includes(r["id"]))
  //     .forEach((e) => e.emit("delete"));

  //   if (filtered.length) {
  //     this.store.set("records", (this.records = filtered));
  //   }
  // }

  private fix(records: T[]) {
    return records.map((r) => {
      const out = new this.whatToMake();
      for (let key in r) {
        out[key] = r[key];
      }
      this.applyAccessModel(out);
      return out;
    });
  }

  deserializeAll() {
    this.records = this.records.map((r) => deserialize(r, r));
  }

  public all() {
    return this.records;
  }
}
