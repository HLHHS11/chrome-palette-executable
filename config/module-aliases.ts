import { resolve } from "path";

const root = resolve(__dirname, "..", "src");
const pagesDir = resolve(root, "pages");

/**
 * `@core/*` などのモジュールエイリアスの唯一の定義元。
 *
 * ビルド (vite) と型検査 (tsconfig の paths) とテスト (vitest) の三者で
 * 解決方法が食い違うと、「ビルドは通るのにテストからは import できない」という
 * 形でテスト可能な範囲が勝手に狭まる。実際それが起きたので、ここに集約する。
 *
 * tsconfig.json の `compilerOptions.paths` とは対応を保つこと。
 * あちらは JSON なので、残念ながらここから読ませることはできない。
 */
export const moduleAliases = {
  "@core": resolve(pagesDir, "core"),
  "@src": root,
  "@assets": resolve(root, "assets"),
  "@pages": pagesDir,
  "~": resolve(pagesDir, "popup"),
} as const;

export const popupDir = resolve(pagesDir, "popup");
