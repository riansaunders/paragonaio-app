import { BaseModel } from "@entities/BaseModel";
import { ipcRenderer, IpcRendererEvent } from "electron";
import { useEffect, useState } from "react";
import { ModelDAL } from "src/dal/ModelDAL";

export function useIPCEvent(
  event: string,
  handler: (event: IpcRendererEvent, ...args: any[]) => void
) {
  useEffect(() => {
    ipcRenderer.on(event, handler);

    return () => {
      ipcRenderer.removeListener(event, handler);
    };
  });
}

export function useDALRecords<T extends BaseModel>(x: ModelDAL<any>): T[] {
  const what = x;

  const getAll = () => what.all();
  const [all, setAll] = useState(getAll());
  useEffect(() => {
    const refresh = () => setAll((_) => [...getAll()]);

    const listener = (_: T) => {
      refresh();
    };

    what.on("rearrange", refresh);
    what.on("save", listener);
    what.on("remove", listener);
    return () => {
      what.removeListener("rearrange", refresh);
      what.removeListener("save", listener);
      what.removeListener("remove", listener);
    };
  }, []);

  return all;
}
