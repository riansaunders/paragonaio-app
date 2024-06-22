import { ipcMain } from "electron";

const getRoutes = new Map<string, HandlerContainer>();
const postRoutes = new Map<string, HandlerContainer>();
const deleteRoutes = new Map<string, HandlerContainer>();
const patchRoutes = new Map<string, HandlerContainer>();

interface HandlerContainer {
  response: (req: IPCRequest) => Promise<any>;
}
interface IPCRequest {
  senderID: string;
  resource: string;
  body: any;
}

ipcMain?.handle("get", async (event, arg: IPCRequest) => {
  const handler = getRoutes.get(arg.resource);
  if (handler) {
    return await handler.response({
      ...arg,
      senderID: String(event.sender.id),
    });
  } else {
    console.warn("Unhandled GET: " + arg.resource);
    return undefined;
  }
});

ipcMain?.handle("post", async (event, arg: IPCRequest) => {
  const handler = postRoutes.get(arg.resource);
  if (handler) {
    return await handler.response({
      ...arg,
      senderID: String(event.sender.id),
    });
  } else {
    console.warn("Unhandled POST: " + arg.resource);
    return undefined;
  }
});

ipcMain?.handle("patch", async (event, arg: IPCRequest) => {
  const handler = patchRoutes.get(arg.resource);
  if (handler) {
    return await handler.response({
      ...arg,
      senderID: String(event.sender.id),
    });
  } else {
    console.warn("Unhandled PATCH: " + arg.resource);
    return undefined;
  }
});
ipcMain?.handle("delete", async (event, arg: IPCRequest) => {
  const handler = deleteRoutes.get(arg.resource);
  if (handler) {
    return await handler.response({
      ...arg,
      senderID: String(event.sender.id),
    });
  } else {
    console.warn("Unhandled DELETE: " + arg.resource);
    return undefined;
  }
});

export function get(route: string, handler: (req: IPCRequest) => any) {
  getRoutes.set(route, {
    response: handler,
  });
}
export function post(route: string, handler: (req: IPCRequest) => any) {
  postRoutes.set(route, {
    response: handler,
  });
}
export function patch(route: string, handler: (req: IPCRequest) => any) {
  patchRoutes.set(route, {
    response: handler,
  });
}
export function del(route: string, handler: (req: IPCRequest) => any) {
  deleteRoutes.set(route, {
    response: handler,
  });
}
