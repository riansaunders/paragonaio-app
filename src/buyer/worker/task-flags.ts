export const SafeMode = 1 << 1;
export const Preload = 1 << 2;
export const Experimental = 1 << 4;
export const FastMode = 1 << 5;
export const Fastest = 1 << 6;

export const SafePreload = SafeMode | Preload;
export const SafePreloadExperimental = SafePreload | Experimental;

export const SafeModeV3 = SafeMode | Experimental;
export const SafePreloadV3 = SafeModeV3 | Preload;
