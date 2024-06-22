export class BaseModel {
  id!: string;

  static create<T extends BaseModel>(what: Partial<T>): T {
    const x = new this() as any;
    const y = what as any;

    for (let key of Object.keys(y)) {
      x[key] = y[key];
    }
    return x;
  }
}
