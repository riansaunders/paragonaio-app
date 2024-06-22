export const isProd = process.env.NODE_ENV === "production";

export const apiEndpoint = String(
  isProd ? "https://api.paragonaio.com/api" : "http://localhost:3031/api"
);

export const encryptionKey = "VKncLGmAux4RNjsT0LtfM1Ajbq8AUlNUn03WeS4N5s8=";
export const logEncryptionKey = "slpSqgENy6pMPNgx+jjX0ZQ3M3xaH4ysC2s+fjgkiEo=";
