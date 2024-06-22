export type CacheEvents<T> = {
  itemUpdated: (item: T) => void;
};
