import { crx } from "@crxjs/vite-plugin";
import { resolve } from "path";
// import devtools from "solid-devtools/vite";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

import { moduleAliases, popupDir } from "./config/module-aliases";
import manifest from "./src/manifest";

const outDir = resolve(__dirname, "dist");
const publicDir = resolve(__dirname, "public");

const isDev = process.env.__DEV__ === "true";

export default defineConfig(({ command }) => {
  return {
    plugins: [
      // devtools({
      //   /* features options - all disabled by default */
      //   autoname: true, // e.g. enable autoname
      // }),
      solidPlugin(),
      crx({ manifest }),
    ],
    resolve: {
      alias: {
        ...moduleAliases,
        "webextension-polyfill":
          command === "serve"
            ? resolve(popupDir, "util/mock-browser")
            : "webextension-polyfill",
      },
    },
    publicDir,
    build: {
      outDir,
      sourcemap: isDev,
      target: "esnext",
      rollupOptions: {
        // input: {
        //   devtools: resolve(pagesDir, "devtools", "index.html"),
        //   panel: resolve(pagesDir, "panel", "index.html"),
        //   content: resolve(pagesDir, "content", "index.ts"),
        //   background: resolve(pagesDir, "background", "index.ts"),
        //   contentStyle: resolve(pagesDir, "content", "style.scss"),
        //   popup: resolve(pagesDir, "popup", "index.html"),
        //   newtab: resolve(pagesDir, "newtab", "index.html"),
        //   options: resolve(pagesDir, "options", "index.html"),
        // },
        // output: {
        //   entryFileNames: "src/pages/[name]/index.js",
        //   chunkFileNames: isDev
        //     ? "assets/js/[name].js"
        //     : "assets/js/[name].[hash].js",
        //   assetFileNames: (assetInfo) => {
        //     const { dir, name: _name } = path.parse(assetInfo.name);
        //     // const assetFolder = getLastElement(dir.split("/"));
        //     // const name = assetFolder + firstUpperCase(_name);
        //     return `assets/[ext]/${name}.chunk.[ext]`;
        //   },
        // },
      },
    },
  };
});
