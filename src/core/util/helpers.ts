import { BasicProxy } from "@entities/BasicProxy";
import { Product, ProductVariant } from "@entities/Product";
import fs from "fs";
import cheerio from "cheerio";

export function normalizeUrl(uri: string) {
  return uri.endsWith("/") ? uri.substr(0, uri.length - 1) : uri;
}

export function insensitiveFilter(options: any[], filter: string) {
  if (!filter) {
    return options;
  }
  const re = new RegExp(filter, "i");
  return options.filter(({ value }) => value && value.match(re));
}

export function proxyToString(p: BasicProxy) {
  return p.proxyString;
}

export function removeAllExceptSelectorFromHtml(
  html: string,
  selector: string
) {
  const document = cheerio.load(html);
  const checkpoint = document(selector);

  const bad = "cdn.shopify.com";
  document("body")
    .children()
    .each((_, c) => {
      const el = cheerio(c);
      const href = el.attr("href") || "";
      const src = el.attr("src") || "";
      if (
        !el.is("script") ||
        src.includes(bad) ||
        src.includes("klaviyo") ||
        src.includes("zendesk") ||
        src.includes("shopify/") ||
        src.includes("zdassets") ||
        src.includes("myshopify.com") ||
        src.includes("usercentrics") ||
        src.includes("googlead") ||
        src.includes("googletagmanager") ||
        src.includes("steelhousemedia") ||
        src.includes("https://apis.google.com/js/platform.js") ||
        el.attr("dns-prefetch") ||
        el.attr("name") === "commit" ||
        (el.is("script") && el.html()?.toLowerCase().includes("asyncload")) ||
        (el.is("script") && el.hasClass("analytics")) ||
        (el.is("script") &&
          el.html()?.toLowerCase().includes("googletagmanager"))
      ) {
        el.remove();
      }
    });
  document("head")
    .children()
    .each((_, c) => {
      const el = cheerio(c);
      const href = el.attr("href") || "";
      const src = el.attr("src") || "";
      if (
        href.includes(bad) ||
        src.includes(bad) ||
        src.includes("storefront.min.js") ||
        src.includes("klaviyo") ||
        src.includes("zendesk") ||
        src.includes("shopify/") ||
        src.includes("zdassets") ||
        src.includes("myshopify.com") ||
        src.includes("usercentrics") ||
        el.attr("dns-prefetch") ||
        (el.is("script") && el.html()?.toLowerCase().includes("asyncload")) ||
        (el.is("script") && el.hasClass("analytics"))
      ) {
        el.remove();
      }
    });

  document("body").append(checkpoint);

  return document.html();
}

export function proxyForAgent(p: BasicProxy) {
  const obj = proxyToObject(p);
  return {
    host: obj.host,
    port: obj.port,
    auth: obj.username ? `${obj.username}:${obj.password}` : undefined,
  };
}

export function proxyToObject(p: BasicProxy) {
  const [host, port, username, password] = p.proxyString.split(":");
  return {
    host: host,
    port: Number(port),
    ...(username
      ? {
          username: username,
          password: password,
        }
      : {}),
  };
}

export function proxiesToString(proxies: BasicProxy[]) {
  return proxies.map(proxyToString).join("\n");
}

export function randomFromArray<T>(array: T[]): T | undefined {
  if (!array.length) {
    return undefined;
  }
  const res = array[Math.round(Math.random() * (array.length - 1))];
  return res;
}

const collectionsRegex = /\/collections\/[^/]*/;

export function formatProductURL(url: string) {
  if (!url.includes("://")) {
    return url;
  }

  return removeQueryFromURI(url).replace(collectionsRegex, "");
}

export function removeQueryFromURI(uri: string) {
  return uri.split("?")[0];
}

export const arrayIntersection = (array1: any[], array2: any[]) => {
  return array1.filter((value) => array2.includes(value));
};

export function keywords(what: string) {
  if (!what) {
    return [];
  }
  return what.split(" ").filter((word) => !word.startsWith("-"));
}

export function negativeKeywords(what: string) {
  return what
    .split(" ")
    .filter((word) => word.startsWith("-") && word.substr(1).trim().length > 0)
    .map((word) => word.substr(1));
}

export const keywordMatches = (
  name: string,
  search: string[],
  nosearch?: string[]
) => {
  if (!name) {
    return true;
  }
  const matched = new Set<string>();
  for (let keyword of search) {
    const exp = new RegExp(keyword, "i");
    if (exp.test(name)) {
      matched.add(keyword);
    }
  }
  if (nosearch) {
    for (let keyword of nosearch) {
      const exp = new RegExp(keyword, "i");
      if (keyword && exp.test(name)) {
        return false;
      }
    }
  }
  return matched.size === search.length;
};

export function isRandomSize(sizes: string[]) {
  return (
    !sizes.length ||
    (sizes.length === 1 && sizes[0] === "random") ||
    sizes.includes("random")
  );
}

export function getRandomAvailableVariant(
  product: Product,
  sizes?: string[],
  ignoreAvailability?: boolean
) {
  if (!sizes || sizes.length < 1 || isRandomSize(sizes)) {
    const allVs = product.variants.filter(
      (v) => v.inStock || ignoreAvailability
    );
    const ranIDx = Math.round(Math.random() * (allVs.length - 1));

    return allVs[ranIDx];
  } else {
    const theVs = [];
    const vs = product.variants.filter((v) => v.inStock || ignoreAvailability);
    for (let v of vs) {
      const otherSizeNum = Number(v.size);

      const otherSizeLower = v.size.toLowerCase();
      for (let size of sizes) {
        if (size.toLowerCase() === otherSizeLower) {
          theVs.push(v);
          continue;
        }
        const mysizeNum = Number(size);

        if (
          !isNaN(mysizeNum) &&
          !isNaN(otherSizeNum) &&
          otherSizeNum === mysizeNum
        ) {
          theVs.push(v);
        }
      }
    }
    const ranIDx = Math.round(Math.random() * (theVs.length - 1));
    return theVs[ranIDx];
  }
}

export function findVariantMatchingSizeAvailable(
  vs: ProductVariant[],
  sizes?: string[],
  ignoreAvailability?: boolean
): ProductVariant | undefined {
  vs = vs.filter((v) => v.inStock || ignoreAvailability);
  return findVariantMatchingSize(vs, sizes);
}

export function findVariantMatchingSize(
  vs: ProductVariant[],
  sizes?: string[]
): ProductVariant | undefined {
  if (!sizes || !sizes.length || isRandomSize(sizes)) {
    return vs[Math.floor(Math.random() * (vs.length - 1))];
  }
  for (let v of vs) {
    const otherSizeNum = Number(v.size);

    const otherSizeLower = v.size.toLowerCase();
    for (let size of sizes) {
      if (size.toLowerCase() === otherSizeLower) {
        return v;
      }
      const mysizeNum = Number(size);

      if (
        !isNaN(mysizeNum) &&
        !isNaN(otherSizeNum) &&
        otherSizeNum === mysizeNum
      ) {
        return v;
      }
    }
  }
}

export function formToObject(object: { name: string; value: string }[]) {
  const out: any = {};
  for (let o of object) {
    out[o.name] = o.value;
  }
  return out;
}

export function writeFile(name: string, pageOrObject: string | any) {
  if (process.env.NODE_ENV === "development") {
    fs.writeFileSync(
      __dirname +
        `/${name}.${typeof pageOrObject === "string" ? "html" : "json"}`,
      typeof pageOrObject !== "string"
        ? JSON.stringify(pageOrObject, null, 2)
        : pageOrObject
    );
  }
}
