import { ShopifyShippingRateCheckout } from "./ShopifyShippingRateCheckout";

export interface ShopifyShippingRate {
  id: string;
  price: string;
  title: string;
  checkout: ShopifyShippingRateCheckout;
  phone_required: boolean;
  delivery_range: any | null;
  estimated_business_days_to_delivery: any[];
  discounted_price: string;
}
