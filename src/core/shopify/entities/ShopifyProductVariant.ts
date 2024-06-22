export interface ShopifyProductVariant {
  id: number;
  title: string;
  option1: string;
  option2: string;
  option3: string;
  position: number;
  featured_image: {
    src: string;
  };
  product_id: number;
  price: string;
  available: boolean;
}
