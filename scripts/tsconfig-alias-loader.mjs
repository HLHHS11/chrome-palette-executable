/**
 * tsconfig.json の `paths` と拡張子なし相対 import を実行時にも効かせる ESM ローダ。
 *
 * ts-node 10.x の ESM 解決はパスエイリアスを見ないため、`@core/...` を
 * import しているモジュールはテストから読み込めない。ビルド (vite) と
 * 型検査 (tsc) だけが解決できてテストだけ解決できない状態は、
 * 「エイリアスを使うとテストが書けない」という形でコードを歪めるので、
 * 依存を増やさずにここで埋めておく。
 *
 * ts-node より先に走る必要があるため、後から登録すること:
 *   node --loader ts-node/esm --loader ./scripts/tsconfig-alias-loader.mjs
 */
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** tsconfig.json はコメント付きなので、雑に剥がしてから JSON として読む。 */
function readTsconfigPaths() {
  const source = readFileSync(
    resolvePath(projectRoot, "tsconfig.json"),
    "utf8"
  );
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const config = JSON.parse(stripped);
  return config.compilerOptions?.paths ?? {};
}

const paths = readTsconfigPaths();

/** `@core/*` のような 1 つだけワイルドカードを含むパターンに対応する。 */
function expand(specifier) {
  for (const [pattern, targets] of Object.entries(paths)) {
    const [prefix, suffix = ""] = pattern.split("*");
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const middle = specifier.slice(
      prefix.length,
      specifier.length - suffix.length
    );
    for (const target of targets) {
      const candidate = resolvePath(projectRoot, target.replace("*", middle));
      const found = firstExisting(candidate);
      if (found) return pathToFileURL(found).href;
    }
  }
  return null;
}

/** `.js` 指定・拡張子なし・ディレクトリのいずれでも実ファイルに辿り着かせる。 */
function firstExisting(candidate) {
  const withoutJs = candidate.replace(/\.js$/, "");
  const attempts = [
    candidate,
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    resolvePath(candidate, "index.ts"),
    resolvePath(candidate, "index.tsx"),
  ];
  return attempts.find(isFile);
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * `./types` のような拡張子なし相対 import を実ファイルへ寄せる。
 * バンドラ (vite) が解決してくれる前提で書かれたソースがそのまま読めるようにする。
 */
function expandRelative(specifier, parentURL) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  if (!parentURL?.startsWith("file:")) return null;
  const base = dirname(fileURLToPath(parentURL));
  const found = firstExisting(resolvePath(base, specifier));
  return found ? pathToFileURL(found).href : null;
}

export async function resolve(specifier, context, nextResolve) {
  const expanded =
    expand(specifier) ?? expandRelative(specifier, context.parentURL);
  if (expanded) return nextResolve(expanded, context);
  return nextResolve(specifier, context);
}
