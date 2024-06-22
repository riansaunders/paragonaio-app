require("dotenv").config();
const { notarize } = require("electron-notarize");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin" || process.env.SKIP_NOTARIZE) {
    return;
  }

  console.log("Notarizing...");

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    appBundleId: "com.paragonaio.voyager",
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLEID,
    appleIdPassword: process.env.APPLEID_PASSWORD,
  });
};
