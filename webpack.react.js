const path = require("path");
const nodeExternals = require("webpack-node-externals");
const TerserPlugin = require("terser-webpack-plugin");
const WebpackObfuscator = require("webpack-obfuscator");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const WorkerPlugin = require("worker-plugin");

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
                drop_console: true,
              },
            },
          }),
        ],
      };
const uiConfig = (env, options) => {
  return {
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      plugins: [new TsconfigPathsPlugin()],
    },
    entry: {
      ui: "./src/ui/renderer.tsx",
    },
    devServer: {
      static: path.join(__dirname, "dist"),
      compress: true,
      // hot: true,

      port: 9000,
    },
    target: "electron-renderer",
    module: {
      rules: [
        {
          test: /\.(js|ts|tsx)$/,
          exclude: [
            /node_modules/,
            /raw/,
            /src\/app\//,
            /src\/buyer\//,
            /src\/monitor\//,
          ],
          use: {
            loader: "babel-loader",
          },
        },
        {
          test: /\.css$/i,
          use: ["style-loader", "css-loader", "postcss-loader"],
        },
      ],
    },
    optimization: optimizations(options),

    plugins:
      options.mode === "development"
        ? [new WorkerPlugin()]
        : [
            new WorkerPlugin(),
            new WebpackObfuscator({
              compact: true,
              controlFlowFlattening: true,
              controlFlowFlatteningThreshold: 0.75,
              deadCodeInjection: true,
              deadCodeInjectionThreshold: 0.4,
              debugProtection: true,
              debugProtectionInterval: false,
              disableConsoleOutput: true,
              identifierNamesGenerator: "hexadecimal",
              numbersToExpressions: true,
              renameGlobals: false,
              rotateStringArray: true,
              // selfDefending: true,
              shuffleStringArray: true,
              simplify: true,

              // splitStrings: true,
              // splitStringsChunkLength: 10,

              stringArray: true,
              stringArrayEncoding: ["base64"],
              stringArrayIndexShift: true,
              stringArrayWrappersCount: 2,
              stringArrayWrappersChainedCalls: true,
              stringArrayWrappersParametersMaxCount: 4,
              stringArrayWrappersType: "function",
              stringArrayThreshold: 0.75,
              // transformObjectKeys: true,
              unicodeEscapeSequence: true,

              log: true,

              // target: "node",
            }),
            new HtmlWebpackPlugin({
              template: "./src/ui/index.html",
            }),
          ],

    externals: [nodeExternals()],
    output: {
      path: path.resolve(__dirname, "raw"),
      filename: "[name].js",
    },
  };
};

module.exports = uiConfig;
