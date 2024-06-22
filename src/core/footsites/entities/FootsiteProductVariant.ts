export interface FootsiteProductVariant {
  stockLevelStatus: "inStock" | "outOfStock";
  code: string;
  isRecaptchaOn: boolean;
  price: FootsiteVariantPrice;
  attributes: VariantAttribute[];
}

export interface VariantAttribute {
  id: string;
  type: "size" | "style";
  value: string;
}

interface FootsiteVariantPrice {
  value: number;
  originalPrice: number;
  formattedValue: string;
  formattedOriginalPrice: string;
}
