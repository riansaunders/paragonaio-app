import { FootsiteProductVariant } from "./FootsiteProductVariant";

export interface FootsiteProduct {
  name: string;

  sellableUnits: FootsiteProductVariant[];

  variantAttributes: FootlockerVariantAttribute[];
  images: [
    {
      code: string;
      variations: [ImageVariation];
    }
  ];
}

interface FootlockerVariantAttribute {
  code: string;
  sku: string;
}

interface ImageVariation {
  format: "cart" | "small" | "large" | "large_wide" | "zoom";
  url: string;
}
