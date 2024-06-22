import {
  keywordMatches,
  keywords,
  negativeKeywords,
  normalizeUrl,
} from "@core/util/helpers";
import { TypedEmitter } from "tiny-typed-emitter";
import { Product } from "../entities/Product";
import { CacheEvents } from "./CacheEvents";

export function productCompare(p: Product, search: string) {
  if (
    // exact match string
    p.title === search ||
    // exact match id
    p.id === search ||
    // exact match monitor
    p.monitor === search ||
    // KW search in title
    keywordMatches(p.title, keywords(search), negativeKeywords(search))
  ) {
    return true;
  }
  return false;
}

export type CachedProduct = Product & {
  storeUrl: string;
};

export class ProductCache extends TypedEmitter<CacheEvents<CachedProduct>> {
  products: CachedProduct[] = [];

  public update(storeUrl: string, obj: Product) {
    storeUrl = normalizeUrl(storeUrl);
    let product = this.find(storeUrl, obj.id);

    if (product) {
      product.productForm = obj.productForm;
      product.variants = obj.variants;
    } else {
      this.products.push(
        (product = {
          ...obj,
          storeUrl: storeUrl,
        })
      );
    }
    this.emit("itemUpdated", product);
  }

  public find(
    storeUrl: string,
    monitorOrID: string
  ): CachedProduct | undefined {
    storeUrl = normalizeUrl(storeUrl);

    for (let p of this.products) {
      if (p.storeUrl === storeUrl && productCompare(p, monitorOrID)) {
        return p;
      }
    }
    return undefined;
  }
}
