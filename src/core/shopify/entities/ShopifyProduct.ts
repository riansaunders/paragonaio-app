import { ShopifyProductOptions } from "./ShopifyProductOptions";
import { ShopifyProductVariant } from "./ShopifyProductVariant";

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  variants: ShopifyProductVariant[];
  options: ShopifyProductOptions[];
  tags: string[];
  images: [
    {
      src: string;
    }
  ];
}
