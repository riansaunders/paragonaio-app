import { MonitorWorker } from "@monitor/worker/MonitorWorker";
import { BuyerWorker } from "@buyer/worker/BuyerWorker";
import { ShopifyProduct } from "./entities/ShopifyProduct";
import { ShopifyProductVariant } from "./entities/ShopifyProductVariant";

export async function getProduct(
  worker: BuyerWorker | MonitorWorker,
  baseURL: string,
  handle: string
): Promise<ShopifyProduct | undefined> {
  if (baseURL.endsWith("/")) {
    baseURL = baseURL.substr(0, baseURL.length - 1);
  }
  return await worker
    .get(`${baseURL}/products/${handle}.json`)
    .then((res) => (res.data as any)?.product);
}

export async function getProducts(
  worker: BuyerWorker | MonitorWorker,
  baseURL: string,
  limit?: number
) {
  if (baseURL.endsWith("/")) {
    baseURL = baseURL.substr(0, baseURL.length - 1);
  }
  return await worker
    .get(`${baseURL}/products.json`.concat(limit ? `?limit=${limit}` : ``))
    .then((res) => res.data)
    .then((data) => data);
}

export function variantMatches(
  v: ShopifyProductVariant,
  sizes?: string[],
  variantName?: string
) {
  const variantRegexp = variantName ? new RegExp(variantName, "i") : undefined;
  if (!sizes || sizes.length <= 1) {
    return true;
  }

  for (let size of sizes) {
    let regex: RegExp;

    try {
      regex = new RegExp(size, "i");
    } catch (e) {
      regex = new RegExp("", "i");
    }
    let sizeMatch = false;
    if (
      (v.option1 && regex.test(v.option1)) ||
      (v.option2 && regex.test(v.option2)) ||
      (!v.option1 && !v.option2)
    ) {
      sizeMatch = true;
    }
    if (
      (!variantRegexp && sizeMatch) ||
      (variantRegexp &&
        ((v.option1 && variantRegexp.test(v.option1)) ||
          (v.option2 && variantRegexp.test(v.option2)) ||
          (!v.option1 && !v.option2)))
    ) {
      return true;
    }
  }
  return false;
}

export function getRandomAvailableVariant(
  product: ShopifyProduct,
  sizes?: string[],
  variantName?: string
) {
  const variantRegexp = variantName ? new RegExp(variantName, "i") : undefined;

  if (!sizes || sizes.length < 1) {
    const allVs = product.variants.filter((v) => v.available);
    const ranIDx = Math.round(Math.random() * (allVs.length - 1));

    return allVs[ranIDx];
  } else {
    const theVs = [];
    for (let size of sizes) {
      let sizeRegex: RegExp;

      try {
        sizeRegex = new RegExp(size, "i");
      } catch (e) {
        sizeRegex = new RegExp("", "i");
      }
      theVs.push(
        product.variants.find((v) => {
          let sizeMatch = false;
          if (
            (v.option1 && sizeRegex.test(v.option1)) ||
            (v.option2 && sizeRegex.test(v.option2)) ||
            (!v.option1 && !v.option2)
          ) {
            sizeMatch = true;
          }
          if (
            (!variantRegexp && sizeMatch) ||
            (variantRegexp &&
              ((v.option1 && variantRegexp.test(v.option1)) ||
                (v.option2 && variantRegexp.test(v.option2)) ||
                (!v.option1 && !v.option2)) &&
              v.available)
          ) {
            return v;
          }
        })
      );
    }
    const ranIDx = Math.round(Math.random() * (theVs.length - 1));
    return theVs[ranIDx];
  }
}
