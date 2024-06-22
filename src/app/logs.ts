import { window } from "@app/main";
import * as Buyer from "@buyer/Buyer";
import * as Api from "./api";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";

import { app, dialog, shell } from "electron";
import { post } from "./main-router";
import { TaskRuntime } from "@entities/TaskRuntime";

const directory = path.join(path.join(app.getPath("userData"), "logs"));
const taskLogs = new Map<string, string[]>();

let runtimes: TaskRuntime[] = [];

ensureDirectoryExists();

Buyer.events.on("logUpdate", (w, m, t) => {
  let logs = taskLogs.get(w.task.id);
  if (!logs) {
    taskLogs.set(w.task.id, (logs = []));
  }
  logs.push(`${new Date().toISOString()}: ${m}`);
});

Buyer.events.on("allWorkersRemoved", () => {
  uploadLogs();
});

Buyer.events.on("checkoutComplete", () => {
  uploadLogs();
});

Buyer.events.on("workerRemoved", (w) => {
  for (let worker of w) {
    const { task } = worker;

    runtimes.push({
      startedBy: task.startedBy,
      storeUrl: task.group.store.url,
      exitStatus: task.exitStatus,
      logs: taskLogs.get(task.id) ?? [],
    });

    taskLogs.delete(task.id);
  }
});

function uploadLogs() {
  try {
    if (!runtimes.length) {
      return;
    }
    Api.client.post("/logs").then((r) => {
      const d = r.data;
      const x = new FormData();
      for (let key of Object.keys(d.fields)) {
        x.append(key, d.fields[key]);
      }
      x.append("file", JSON.stringify(runtimes, null, "\t"));
      axios
        .post(d.url, x, {
          headers: {
            ...x.getHeaders(),
            "Content-Length": x.getLengthSync(),
            Accept: "application/json",
          },
        })
        .then(() => {
          runtimes = [];
          console.log("Logs uploaded");
        })
        .catch((e) => {
          writeLogsToDisk();
          console.error(e.response?.data);
        });
    });
  } catch (e) {
    console.error(e);
  }
}

setInterval(() => {
  uploadLogs();
  // upload logs every set time.
}, 4 * (1000 * 60));

app.on("before-quit", () => {
  writeLogsToDisk();
});

function writeLogsToDisk() {
  if (runtimes?.length) {
    ensureDirectoryExists();
    try {
      fs.writeFile(path.join(directory, getFileName()), encryptLogs(), () => {
        // nothing
      });
    } catch (err) {
      //
    }
    runtimes = [];
  }
}

function ensureDirectoryExists() {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory);
  }
}

function getFileName() {
  return `${new Date().toDateString()}-${Date.now()}.logs`;
}

function encryptLogs() {
  const key = `tHAa2do4OaLRQwynP8hu2OVnvLJ6ZSow`;
  const iv = `Gd2t5CdqmFsFHNib`;
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key), iv);
  let encrypted = cipher.update(JSON.stringify(runtimes, null, 4));

  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted;
}

post("openLogFolder", () => {
  ensureDirectoryExists();
  shell.openPath(directory);
});

post("openExportLogs", async () => {
  if (!runtimes.length) {
    return;
  }

  let encrypted = encryptLogs();

  const result = await dialog.showOpenDialog(window, {
    properties: ["openDirectory", "dontAddToRecent"],
  });
  if (result.canceled) {
    return false;
  }
  const folder = result.filePaths[0];

  fs.writeFileSync(path.join(folder, getFileName()), encrypted);
  runtimes = [];
});
