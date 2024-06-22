import { ShopifyPayment } from "./ShopifyPayment";

export interface ShopifyAPICheckout {
  total_price: string;
  email: string;
  payment_url: string;
  shipping_address?: object;
  processing_url: string;
  token: string;
  payment_due: string;
  completed_at: string | null;
  payments: ShopifyPayment[];
  web_url: string;
}
