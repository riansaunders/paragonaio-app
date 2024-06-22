const path = require("path");
const nodeExternals = require("webpack-node-externals");
const TerserPlugin = require("terser-webpack-plugin");
const WebpackObfuscator = require("webpack-obfuscator");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");

const uiConfig = require("./webpack.react");
const disableConsole = true;

const optimizations = (options) =>
  options.mode === "development"
    ? {}
    : {
        minimize: true,
        minimizer: [
          new TerserPlugin({
            terserOptions: {
              compress: {
                passes: 2,
                drop_console: disableConsole,
              },
            },
          }),
        ],
      };

const appConfig = (env, options) => {
  return {
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      plugins: [new TsconfigPathsPlugin()],
    },
    entry: {
      main: "./src/app/main.ts",
    },
    target: "electron-main",
    module: {
      rules: [
        {
          test: /\.(js|ts|tsx)$/,
          exclude: [/node_modules/, /raw/],
          use: {
            loader: "babel-loader",
          },
        },
      ],
    },
    optimization: optimizations(options),

    plugins:
      options.mode === "development"
        ? []
        : [
            new WebpackObfuscator({
              compact: true,
              controlFlowFlattening: true,
              controlFlowFlatteningThreshold: 0.75,
              deadCodeInjection: true,
              deadCodeInjectionThreshold: 0.4,
              debugProtection: true,
              debugProtectionInterval: false,
              disableConsoleOutput: disableConsole,
              identifierNamesGenerator: "hexadecimal",
              numbersToExpressions: true,
              renameGlobals: false,
              rotateStringArray: true,
              selfDefending: true,
              shuffleStringArray: true,
              simplify: true,

              splitStrings: true,
              splitStringsChunkLength: 10,

              stringArray: true,
              stringArrayEncoding: ["base64"],
              stringArrayIndexShift: true,
              stringArrayWrappersCount: 2,
              stringArrayWrappersChainedCalls: true,
              stringArrayWrappersParametersMaxCount: 4,
              stringArrayWrappersType: "function",
              stringArrayThreshold: 0.75,
              transformObjectKeys: true,
              unicodeEscapeSequence: true,

              log: true,

              target: "node",
            }),
          ],

    externals: [nodeExternals()],
    output: {
      path: path.resolve(__dirname, "raw"),
      filename: "[name].js",
    },
    target: "node",
  };
};

module.exports = (env, options) => [
  appConfig(env, options),
  uiConfig(env, options),
];
