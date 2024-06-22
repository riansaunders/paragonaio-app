import axios from "axios";
import { CookieJar } from "tough-cookie";
import { apiEndpoint } from "../core/config";
import { signOut } from "./main";

const jar = new CookieJar();

const currentGets = new Set<string>();
export let client = axios.create({
  baseURL: apiEndpoint.concat("/aio"),
  jar: jar,
  withCredentials: true,
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const code = error.request?.res?.statusCode;

    if (code === 403 || code === 401) {
      signOut();
    }
    return Promise.reject(error);
  }
);

export async function singletonGet<T>(url: string) {
  if (currentGets.has(url)) {
    return undefined;
  }
  currentGets.add(url);

  return client
    .get<T>(url)
    .then((r) => r.data)
    .catch(() => undefined)
    .finally(() => currentGets.delete(url));
}

export function init(auth: string, userAgent: string) {
  client.defaults.headers["authorization"] = auth;
  client.defaults.headers["user-agent"] = userAgent;
}
