export async function get<E extends any>(
  resource: string,
  body: object = {},
  handler?: (payload: any) => void
): Promise<E> {
  const win = window as any;
  const { ipcRenderer } = win.require("electron");

  return ipcRenderer
    .invoke("get", {
      resource: resource,
      body: body,
    })
    .then((payload: any) => {
      if (handler) {
        handler(payload);
      }
      return payload;
    });
}
export function post(
  resource: string,
  body: object = {},
  handler?: (payload: any) => void
) {
  const win = window as any;
  const { ipcRenderer } = win.require("electron");
  return ipcRenderer
    .invoke("post", {
      resource: resource,
      body: body,
    })
    .then((payload: any) => {
      if (handler) {
        handler(payload);
      }
      return payload;
    });
}
export function patch(
  resource: string,
  body: object = {},
  handler?: (payload: any) => void
) {
  const win = window as any;
  const { ipcRenderer } = win.require("electron");
  return ipcRenderer
    .invoke("patch", {
      resource: resource,
      body: body,
    })
    .then((payload: any) => {
      if (handler) {
        handler(payload);
      }
      return payload;
    });
}
export function del(
  resource: string,
  body: object = {},
  handler?: (payload: any) => void
) {
  const win = window as any;
  const { ipcRenderer } = require("electron");
  return ipcRenderer
    .invoke("delete", {
      resource: resource,
      body: body,
    })
    .then((payload: any) => {
      if (handler) {
        handler(payload);
      }
      return payload;
    });
}
