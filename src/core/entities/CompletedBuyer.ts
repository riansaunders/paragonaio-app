import { BaseModel } from "./BaseModel";
import { Product } from "./Product";
import { Store } from "./Store";

type CompletedProduct = Exclude<Product, "variants" | "productForm" | "id"> & {
  size: string;
};

export class CompletedBuyer extends BaseModel {
  public store!: Store;
  public product!: CompletedProduct;
  public date!: string;
  public success!: boolean;
}
