export enum TaskStep {
  // Getting Started
  NavigatingToSite,
  LoggingIn,
  GettingSession,
  PreloadingATC,
  PreloadingStartCheckout,
  BeginProductSearch,

  // Product Related

  AddingToCart,

  // Shopify
  PreloadingClearCart,

  // Checkout Flow
  SubmittingAddressInformation,
  SubmittingBilling,
  GettingShippingRates,
  SubmittingShippingRate,
  CalculatingTaxes,
  CheckingOut,
  CheckingOrderStatus,
  SubmittingEmail,
  EnterAddressInformation,

  // Other
  Error,

  Complete,
  NavigateToProductDetails,
  NavigateToProductPage,
  SelectVariant,
  SubmitAddressAfterPreload,
  WaitForPaymentMethods,
  GetCheckout,
  HandleGetCheckoutIssues,

  SetPreloadingPositive,
  SetPreloadingNegative,
  EmitExtraInfo,

  EnterGiftCard,
  DebugA,
  DebugB,

  PreloadPaymentSession,
  DebugC,
  DebugD,
  PreloadPaymentPage,
  PreloadGetCheckout,

  SetDelay,

  LoadSite,

  QueueItComplete,
}
