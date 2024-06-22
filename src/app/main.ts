require("dotenv").config();
import * as Buyer from "@buyer/Buyer";
import { stores } from "@core/util/stores";
import { Platform } from "@entities/Store";
import * as Monitor from "@monitor/Monitor";
import { Client as RPCClient } from "discord-rpc";
import { app, BrowserWindow, dialog, Menu, powerSaveBlocker } from "electron";
import log from "electron-log";
import { autoUpdater } from "electron-updater";
import path from "path";
import "reflect-metadata";
import { isProd } from "../core/config";
import "../dal/DAL";
import { getLoadedModels, SettingsModel, TaskGroupModel } from "../dal/DAL";
import * as Cloud from "./ably";
import * as Api from "./api";
import "./automation";
import { cancelAutoSolve, initAutosolve } from "./aycd";
import "./discord";
import "./logs";
import { get, post } from "./main-router";
import "./profiles";
import { proxyPort, startProxyServer } from "./proxy-server";
import { SignInResult } from "../core/entities/SignInResult";
import { clearOpenChallengesAndSolvers } from "./solvers";
// pure modules
import "./tasks";
import "./analytics";

// @ts-ignore
log.transports.file = false;
Object.assign(console, log.functions);
app.setMaxListeners(20);

export let window: BrowserWindow;
let updateReadyToDownload = false;

let updateDownloadProgress: number = 0;
let suspensionID: number = 0;

let rpc: RPCClient;
const start = new Date();

let failedHeartbeats: number = 0;
let updateInterval: NodeJS.Timeout;
let rpcInterval: NodeJS.Timeout;
let heartbeatInterval: NodeJS.Timeout;

let isCheckingForUpdate = false;

post("signIn", async ({ body }) => {
  return <SignInResult>await Api.client
    .post("/signin", {
      key: body.key,
    })
    .then((r) => r.data)
    .then(async (d) => {
      const { token } = d;
      autoUpdater.autoDownload = true;

      if (isProd) {
        await checkForUpdates();
        if (updateReadyToDownload) {
          sendMessage("updateReady");
          return {
            success: false,
            error: undefined,
          };
        }
      }

      sendMessage("signIn");

      Api.init(token, window.webContents.userAgent);
      Cloud.init(token);

      Buyer.setLocked(false);
      Monitor.setLocked(false);

      rpc = new RPCClient({ transport: "ipc" });
      rpc.on("ready", () => {
        setActivity();

        // activity can only be set every 15 seconds
        rpcInterval = setInterval(() => {
          setActivity();
        }, 15e3);
      });

      rpc
        .login({
          clientId: "757239770769391797",
        })
        .catch(() => {});

      const settings = SettingsModel.first();
      if (settings?.autoSolveApiKey && settings?.autoSolveAccessToken) {
        initAutosolve(settings.autoSolveAccessToken, settings.autoSolveApiKey);
      }

      heartbeatInterval = setInterval(() => {
        Api.client
          .get("/heartbeat", {
            timeout: 1000 * 30,
          })
          .then(() => {
            failedHeartbeats = 0;
          })
          .catch((e) => {
            if (e.message?.includes("timeout of")) {
              if (++failedHeartbeats >= 3) {
                signOut();
                failedHeartbeats = 0;
              }
            }
          });
      }, 5000);
      return {
        success: true,
      };
    })
    .catch((e) => {
      console.error(e);
      const error = e.response?.data?.error;

      return {
        success: false,
        error: typeof error === "string" ? error : undefined,
      };
    });
});

export function signOut() {
  try {
    if (rpcInterval) {
      clearInterval(rpcInterval);
    }

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    rpc.removeAllListeners();
    rpc.destroy();

    clearOpenChallengesAndSolvers();
    Buyer.setLocked(true);
    Monitor.setLocked(true);
    Cloud.unsubscribe();

    autoUpdater.autoDownload = false;

    BrowserWindow.getAllWindows().forEach((w) => {
      if (w !== window) {
        w.close();
      }
    });

    sendMessage("signOut");

    window.show();
    Buyer.clearWorkers();
    Monitor.clearWorkers();

    cancelAutoSolve();
  } catch (err) {
    console.error(err);
  }
}

function setMenu() {
  const menu: Electron.MenuItemConstructorOptions[] = isProd
    ? [
        {
          label: "ParagonAIO",
          submenu: [
            { role: "about", label: "About" },
            { label: `Version ${app.getVersion()}`, enabled: false },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
        {
          role: "editMenu",
        },

        { role: "windowMenu" },
        // golsup
        // { role: "viewMenu" },
      ]
    : [
        {
          label: "ParagonAIO ",
          submenu: [
            { role: "about" },
            { label: `Version ${app.getVersion()}`, enabled: false },

            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },

        {
          role: "editMenu",
        },
        { role: "windowMenu" },
        { role: "viewMenu" },
      ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
}

async function checkForUpdates() {
  if (isCheckingForUpdate) {
    return;
  }

  isCheckingForUpdate = true;
  await autoUpdater.checkForUpdates().catch((e) => console.error(e));
  isCheckingForUpdate = false;
}

async function startup() {
  // completeLoading();
  setMenu();

  for (let model of getLoadedModels()) {
    post(`save_${model.name}`, async ({ body }) => {
      model.replaceOrCreate(body.id, body);
    });
    post(`remove_${model.name}`, async ({ body }) => {
      model.findByIdAndRemove(body.id);
    });
    post(`rearrange_${model.name}`, async ({ body }) => {
      model._rearrange(body.source, body.destination);
      model.save(model.all()[body.source]);
    });
  }

  await startProxyServer();
  updateAppSuspensionBlocker();
  updateAppSuspensionBlocker();

  const set = new Set<string>();
  stores
    .filter((s) => s.platform === Platform.Shopify)
    .map((s) => new URL(s.url).host)
    .forEach((s) => set.add(s));

  for (let tg of TaskGroupModel.all().filter(
    (t) => t.store.platform === Platform.Shopify
  )) {
    set.add(new URL(tg.store.url).host);
  }

  const _shop = Array.from(set)
    .map((s) => `MAP ${s} 127.0.0.1:${proxyPort}`)
    .join(", ");

  app.commandLine.appendSwitch(
    "host-rules",
    _shop.concat(
      `, MAP *.queue-it.net 127.0.0.1:${proxyPort}, MAP *.myshopify.com 127.0.0.1:${proxyPort}, MAP inline.amd.com 127.0.0.1:${proxyPort}, MAP *.captcha-delivery.com 127.0.0.1:${proxyPort}, MAP *.playstation.com 127.0.0.1:${proxyPort}`
    )
  );

  window = new BrowserWindow({
    width: 1240,
    height: 800,
    title: "ParagonAIO",
    show: false,
    frame: false,
    webPreferences: {
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.on("did-fail-load", () => {
    if (!isProd) {
      dialog.showErrorBox("No man", "NOOO MAN");
    }
  });

  if (isProd) {
    await window.loadFile(path.resolve(__dirname, "index.html"));
  } else {
    await window.loadURL("http://localhost:9000");
  }

  // super dangerous stuff so that I can work locally.
  sendMessage("signIn");
  Buyer.setLocked(false);
  Monitor.setLocked(false);
}

export function playSound(fileName: string) {
  sendMessage("playSound", {
    file: fileName,
  });
}

async function setActivity() {
  if (!rpc) {
    return;
  }
  try {
    rpc.setActivity({
      details: isProd ? `v${app.getVersion()}` : `In The Lab 🧪`,
      state: `https://paragonaio.com`,
      startTimestamp: start,
      largeImageKey: "logo",
      instance: false,
    });
  } catch (err) {
    console.error(`Set Activity Failed`);
  }
}

function updateAppSuspensionBlocker() {
  const isStarted = powerSaveBlocker.isStarted(suspensionID);
  if (!isStarted) {
    suspensionID = powerSaveBlocker.start("prevent-app-suspension");
  }

  console.log(`${isStarted} blocker started ${suspensionID}`);
}

export function sendMessage(event: string, body?: any) {
  try {
    window?.webContents.send(event, body);
  } catch (err) {
    //
  }
}

get("version", async () => {
  return {
    version: app.getVersion(),
  };
});

post("quit", () => {
  app.quit();
});
post("minimize", () => {
  window?.minimize();
});

post("installUpdates", async () => {
  autoUpdater.quitAndInstall();
});
autoUpdater.on("checking-for-update", () => {});

// autoUpdater.on("error", (e) => {
//   console.error(e);
// });

autoUpdater.on("update-available", () => {
  updateReadyToDownload = true;
});

autoUpdater.on("update-not-available", () => {
  console.log("No update");
});

autoUpdater.on(
  "download-progress",
  ({
    percent,
    bytesPerSecond,
  }: {
    total: number;
    delta: number;
    transferred: number;
    percent: number;
    bytesPerSecond: number;
  }) => {
    percent = Math.round(percent);
    if (percent > updateDownloadProgress) {
      sendMessage("updateDownloadProgress", (updateDownloadProgress = percent));
    }
  }
);

autoUpdater.on("update-downloaded", () => {
  if (Buyer.locked || Monitor.locked) {
    return;
  }

  setMenu();

  clearInterval(updateInterval);

  const doTheUpdate = () => {
    setTimeout(() => {
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.quitAndInstall(false, true);
    }, 1100);
  };

  if (Buyer.activeCount() < 1) {
    doTheUpdate();
  } else {
    window.webContents.send("updateDownloadProgress", 100);
    Buyer.events.once("allWorkersRemoved", () => doTheUpdate());
  }
});

app.setAboutPanelOptions({
  applicationName: "Paragon",
  website: "https://paragonaio.com",
  copyright: "ParagonAIO",
  iconPath: "public/logo.png",
});

// bootstrapping

// if (false) {
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.commandLine.appendSwitch("ignore-certificate-errors");
  app.commandLine.appendSwitch("allow-insecure-localhost");
  app.commandLine.appendSwitch("disable-site-isolation-trials");
  app.commandLine.appendSwitch("-autoplay-policy", "no-user-gesture-required");
  app.commandLine.appendSwitch("ignore-urlfetcher-cert-requests");
  app.commandLine.appendSwitch("allow-running-insecure-content");
  autoUpdater.autoInstallOnAppQuit = true;

  // 20 minutes
  if (isProd) {
    updateInterval = setInterval(() => checkForUpdates(), 1.2e6);
  }

  app.on("second-instance", (y) => {
    window?.show();
  });

  app.on("before-quit", () => {
    Buyer.clearWorkers();
    cancelAutoSolve();
  });

  app.on("activate", () => window?.show());

  app.on("ready", startup);
}
