export interface Product {
  id: string;
  title: string;
  monitor: string;

  url: string;
  variants: ProductVariant[];

  price?: string;
  imageURL?: string;
  productForm?: any;
}
export interface ProductVariant {
  id: string;

  size: string;
  color?: string;
  imageURL?: string;
  inStock?: boolean;
}
