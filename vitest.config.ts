import { defineConfig } from "vitest/config";

import { moduleAliases } from "./config/module-aliases";

/**
 * テスト専用の設定。
 *
 * `vite.config.ts` をそのまま流用しないのは、あちらが持つ `crx()` プラグインが
 * 拡張機能のビルドを前提にしており、テスト実行時には邪魔になるため。
 * 一方でモジュール解決はビルドと一致していなければ意味がないので、
 * エイリアスは `config/module-aliases.ts` から共有する。
 */
export default defineConfig({
  resolve: { alias: moduleAliases },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
