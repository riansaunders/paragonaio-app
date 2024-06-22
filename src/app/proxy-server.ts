import { app } from "electron";
import express from "express";
import fs from "fs";
import http from "http";
import httpProxy from "http-proxy";
import https from "https";
import net from "net";
import path from "path";
import { challenges } from "./solvers";

export let proxyPort = 43596;

export function createServerHttpx(opts: https.ServerOptions, handler: any) {
  const httpHandler = http.createServer(handler);
  const httpsHandler = https.createServer(opts, handler);
  let server = net.createServer((socket) => {
    socket.once("data", (buffer) => {
      // Pause the socket
      socket.pause();

      // Determine if this is an HTTP(s) request
      let byte = buffer[0];

      let protocol;
      if (byte === 22) {
        protocol = "https";
      } else if (32 < byte && byte < 127) {
        protocol = "http";
      }

      let proxy = protocol === "https" ? httpsHandler : httpHandler;
      if (proxy) {
        // Push the buffer back onto the front of the data stream
        socket.unshift(buffer);

        // Emit the socket to the HTTP(s) server
        proxy.emit("connection", socket);
      }

      // As of NodeJS 10.x the socket must be
      // resumed asynchronously or the socket
      // connection hangs, potentially crashing
      // the process. Prior to NodeJS 10.x
      // the socket may be resumed synchronously.
      process.nextTick(() => socket.resume());
    });
  });

  return server;
}

export async function startProxyServer(): Promise<any> {
  const assetsPath = app.isPackaged
    ? path.join(process.resourcesPath, "dist/sslkeys")
    : "./sslkeys/";

  var options = {
    key: fs.readFileSync(path.join(assetsPath, "key.pem")),
    cert: fs.readFileSync(path.join(assetsPath, "cert.pem")),
  };

  const eApp = express();
  var regularProxy = httpProxy.createServer();

  eApp.use("/*", (req, res) => {
    const host = req.headers["host"]!;
    // if (1 === 1) {
    //   return res.status(200).write("Ok");
    // }

    const __replaceWith =
      req.headers["X-OMG-TASKID"] || req.headers["x-omg-taskid"];

    if (__replaceWith) {
      const challenge = challenges.find(
        (c) => c.active && c.id === __replaceWith
      );

      if (challenge && challenge.html) {
        res.setHeader("content-type", "text/html");
        res.status(200).send(challenge.html);
        return;
      }
    }

    try {
      regularProxy.web(req, res, {
        changeOrigin: true,
        autoRewrite: true,
        target: req.protocol.concat("://").concat(host),
      });
    } catch (e) {
      // res.status(500).end();
    }
  });

  process.on("uncaughtException", function (error) {
    // Handle the error
  });

  eApp.disable("x-powered-by");
  eApp.on("error", (a) => {});

  try {
    return new Promise((resolve, reject) => {
      createServerHttpx(options, eApp).listen(proxyPort, () => {
        console.log("Proxy Server listening on", proxyPort);
        resolve({});
      });
      setTimeout(() => reject(), 100);
    }).catch(() => {
      console.log("Failed to start proxy server");

      proxyPort += 1;
      return startProxyServer();
    });
  } catch (e) {
    console.log("Failed to start proxy server");
    proxyPort += 1;
    return startProxyServer();
  }
}
