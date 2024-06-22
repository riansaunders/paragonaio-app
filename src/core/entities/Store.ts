export enum Platform {
  Shopify,
  Footsite,
}

export interface Store {
  platform: Platform;

  name: string;

  url: string;
}
