import { ShopifyPaymentTransaction } from "./ShopifyPaymentTransaction";

export interface ShopifyPayment {
  id: number;
  payment_processing_error_message: string | null;
  transaction: ShopifyPaymentTransaction;
}
