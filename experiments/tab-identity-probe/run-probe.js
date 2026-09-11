import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { startOriginServers } from "./server.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.join(HERE, "extension");
const TOKEN_KEY = "__cpe_probe_token__";
// 既定はヘッドレス。macOS では headed にすると操作のたびに Chromium が前面を
// 奪ってしまうため、視認性は動画 + トレースで担保する。
// PROBE_HEADED=1 で headed に切り替え可能。
const HEADED = process.env.PROBE_HEADED === "1";
const ARTIFACT_DIR = path.join(HERE, "artifacts");
const PORTS = [39101, 39102];

const results = [];
function record(id, question, outcome, detail) {
  results.push({ id, question, outcome, detail });
  const mark =
    outcome === "SURVIVES" ? "✅" : outcome === "LOST" ? "❌" : "⚠️ ";
  console.log(`${mark} [${id}] ${question}\n      → ${outcome}: ${detail}\n`);
}

async function launch(userDataDir, extraArgs = []) {
  // NOTE: 拡張のロードにはブラウザの選択が効く。
  //  - channel:"chrome" (Chrome 152 stable) … 自動化下で --load-extension が無効。不可。
  //  - 既定の headless (headless shell) …… 拡張非対応。不可。
  //  - channel:"chromium" ………………………… 完全版 Chromium。headless でも拡張が動く。可。
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: !HEADED,
    recordVideo: { dir: path.join(ARTIFACT_DIR, "video") },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      ...extraArgs,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 30_000 }));
  return { context, worker };
}

/**
 * MV3 の Service Worker はアイドルで停止し、ターゲットが作り直される。
 * 掴みっぱなしのハンドルは "Target ... has been closed" で失敗するため都度取り直す。
 */
async function swEval(context, fn, arg) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
    try {
      return await worker.evaluate(fn, arg);
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}

const readToken = (page) =>
  page.evaluate((key) => sessionStorage.getItem(key), TOKEN_KEY);

/** content script が token を書き終えるまで待つ。 */
async function waitForToken(page, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const token = await readToken(page).catch(() => null);
    if (token) return token;
    await page.waitForTimeout(150);
  }
  return null;
}

/**
 * S4: chrome.tabs.discard()
 *
 * 結論: Playwright では測定できない。discard 自体は成功する (discarded:true と
 * 新しい tabId が返る) が、その直後に CDP 接続配下の全ターゲットが消滅し、
 * ブラウザごと切断される。headless / headed の双方で再現するため headless 固有の
 * 問題ではない。ここでは discard が成功した事実だけを記録し、token の生存は
 * 手動検証に委ねる。
 */
async function probeDiscard(origin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpe-probe-discard-"));
  let context;
  const question =
    "chrome.tabs.discard() でタブを破棄し再活性化したとき token は残るか";
  try {
    const launched = await launch(dir);
    context = launched.context;
    const extensionId = launched.worker.url().split("/")[2];

    // NOTE: MV3 の Service Worker はアイドルでサスペンドし、evaluate が
    //       "Target has been closed" で落ちる。拡張ページはサスペンドしないため、
    //       chrome.* の呼び出し口をこちらに置く。
    const console_ = await context.newPage();
    await console_.goto(`chrome-extension://${extensionId}/probe.html`);
    const call = (fn, arg) => console_.evaluate(fn, arg);

    const page = await context.newPage();
    await page.goto(`${origin}/s4`);
    const before = await waitForToken(page);

    // Chrome が実際に discard するのはバックグラウンドタブのみ。対象を非アクティブに
    // してから破棄しないと、アクティブタブの破棄という非現実的な条件になる。
    const keepAlive = await context.newPage();
    await keepAlive.goto(`${origin}/keep-alive`);
    await waitForToken(keepAlive);

    const tabId = await call(async () => {
      const tabs = await chrome.tabs.query({});
      const keep = tabs.find((t) => (t.url ?? "").includes("/keep-alive"));
      if (keep) await chrome.tabs.update(keep.id, { active: true });
      return tabs.find((t) => (t.url ?? "").includes("/s4"))?.id ?? null;
    });
    if (tabId === null) throw new Error("対象タブが見つからない");
    await new Promise((r) => setTimeout(r, 800));

    const discarded = await call(async (id) => {
      const t = await chrome.tabs.discard(id);
      return { id: t?.id ?? null, discarded: t?.discarded ?? null };
    }, tabId);

    record(
      "S4",
      question,
      "NOT_MEASURABLE",
      `discard は成功する (${JSON.stringify(discarded)}) が、直後に Playwright の` +
        " ブラウザ接続ごと全ターゲットが落ちるため token を読み戻せない。手動検証が必要。"
    );
  } catch (e) {
    record("S4", question, "NOT_MEASURABLE", `例外: ${String(e).split("\n")[0]}`);
  } finally {
    await context?.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const servers = await startOriginServers(PORTS);
  const [originA, originB] = servers.origins;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cpe-probe-"));
  console.log(`profile: ${userDataDir}`);
  console.log(`headed: ${HEADED} (既定はヘッドレス)\n`);

  fs.rmSync(ARTIFACT_DIR, { recursive: true, force: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  let { context, worker } = await launch(userDataDir);
  await context.tracing.start({ screenshots: true, snapshots: true });
  const browserVersion = context.browser()?.version() ?? "unknown (persistent context)";
  console.log(`browser: Chromium ${browserVersion}\n`);

  // --- S0: content script が書いた値をページ側 (MAIN world) から読めるか -----
  const page = await context.newPage();
  await page.goto(`${originA}/s0`);
  const s0Token = await waitForToken(page);
  record(
    "S0",
    "content script が書いた token をページ自身の JS から読めるか（名前空間の共有）",
    s0Token ? "SURVIVES" : "LOST",
    s0Token
      ? `MAIN world から読めた (${s0Token.slice(0, 8)}…)。ページ側スクリプトと同一の名前空間を共有している。`
      : "MAIN world から読めなかった"
  );

  // --- S1: 単純リロード -----------------------------------------------------
  await page.reload();
  const s1Token = await waitForToken(page);
  record(
    "S1",
    "ページをリロードしても token は残るか",
    s1Token === s0Token ? "SURVIVES" : "LOST",
    `before=${String(s0Token).slice(0, 8)}… after=${String(s1Token).slice(0, 8)}…`
  );

  // --- S2: 同一タブ内のクロスオリジン遷移 -----------------------------------
  await page.goto(`${originB}/s2`);
  const s2TokenOnB = await waitForToken(page);
  await page.goto(`${originA}/s2-back`);
  const s2TokenBackOnA = await waitForToken(page);
  record(
    "S2",
    "同一タブ内でクロスオリジン遷移したとき token はどうなるか",
    s2TokenOnB !== s0Token && s2TokenBackOnA === s0Token ? "LOST" : "UNKNOWN",
    `originA=${String(s0Token).slice(0, 8)}… originB=${String(s2TokenOnB).slice(0, 8)}… ` +
      `originA再訪=${String(s2TokenBackOnA).slice(0, 8)}… — ` +
      (s2TokenOnB !== s0Token
        ? "オリジンごとに別の名前空間。遷移先では token が見えないため background からの再スタンプが必須。"
        : "オリジンをまたいで共有されている（想定外）"),
  );

  // --- S3: タブを閉じて chrome.sessions.restore() で復元 ---------------------
  const s3Page = await context.newPage();
  await s3Page.goto(`${originA}/s3`);
  const s3Before = await waitForToken(s3Page);
  // NOTE: CDP 経由の page.close() は TabRestoreService に載らない可能性が指摘されて
  //       いるため、実ユーザーの Cmd+W に近い chrome.tabs.remove() で閉じる。
  await swEval(context, async () => {
    const tabs = await chrome.tabs.query({});
    const target = tabs.find((t) => (t.url ?? "").includes("/s3"));
    if (target) await chrome.tabs.remove(target.id);
  });
  await new Promise((r) => setTimeout(r, 1000));

  const restoreOutcome = await swEval(context, async () => {
    const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 5 });
    const target = sessions.find((s) => s.tab);
    if (!target) return { ok: false, reason: "recently closed に tab が無い" };
    await chrome.sessions.restore(target.tab.sessionId);
    return { ok: true, sessionId: target.tab.sessionId };
  });

  let s3After = null;
  if (restoreOutcome.ok) {
    await new Promise((r) => setTimeout(r, 2500));
    const restored = context
      .pages()
      .find((p) => p.url().includes("/s3") && !p.isClosed());
    if (restored) s3After = await waitForToken(restored);
  }
  record(
    "S3",
    "タブを閉じて chrome.sessions.restore() で復元したとき token は残るか",
    !restoreOutcome.ok
      ? "UNKNOWN"
      : s3After === s3Before
        ? "SURVIVES"
        : "LOST",
    !restoreOutcome.ok
      ? `復元自体に失敗: ${restoreOutcome.reason}`
      : `before=${String(s3Before).slice(0, 8)}… after=${String(s3After).slice(0, 8)}…`
  );

  // --- S5: ブラウザ再起動 + セッション復元 -----------------------------------
  const s5Page = await context.newPage();
  await s5Page.goto(`${originA}/s5`);
  const s5Before = await waitForToken(s5Page);
  await context.tracing.stop({
    path: path.join(ARTIFACT_DIR, "trace-before-restart.zip"),
  });
  await context.close();
  await new Promise((r) => setTimeout(r, 1500));

  // Chrome に「前回開いていたタブを復元」させるための Preferences 書き換え。
  const prefsPath = path.join(userDataDir, "Default", "Preferences");
  let prefsPatched = false;
  try {
    const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    prefs.session = { ...prefs.session, restore_on_startup: 1 };
    prefs.profile = {
      ...prefs.profile,
      exit_type: "Normal",
      exited_cleanly: true,
    };
    fs.writeFileSync(prefsPath, JSON.stringify(prefs));
    prefsPatched = true;
  } catch (e) {
    console.log(`  (Preferences 書き換え失敗: ${e})`);
  }

  const relaunched = await launch(userDataDir, ["--restore-last-session"]);
  context = relaunched.context;
  worker = relaunched.worker;
  await context.tracing.start({ screenshots: true, snapshots: true });
  await new Promise((r) => setTimeout(r, 4000));

  const restoredS5 = context
    .pages()
    .find((p) => p.url().includes("/s5") && !p.isClosed());
  let s5After = null;
  if (restoredS5) s5After = await waitForToken(restoredS5);

  record(
    "S5",
    "ブラウザを再起動しセッション復元したとき token は残るか",
    !restoredS5
      ? "UNKNOWN"
      : s5After === s5Before
        ? "SURVIVES"
        : "LOST",
    !restoredS5
      ? `復元されたタブを検出できず (prefs書き換え=${prefsPatched}, 開いているURL=${context
          .pages()
          .map((p) => p.url())
          .join(", ")})`
      : `before=${String(s5Before).slice(0, 8)}… after=${String(s5After).slice(0, 8)}…`
  );

  // --- S4: discard はタブのターゲットを破棄し context を巻き込むことがあるため、
  //          独立したブラウザセッションに隔離して最後に実行する。
  await probeDiscard(originA);

  const log = await swEval(context, () =>
    chrome.storage.local.get("log").then((r) => r.log ?? [])
  );

  await context.tracing.stop({
    path: path.join(ARTIFACT_DIR, "trace-after-restart.zip"),
  });
  await context.close();
  await servers.close();

  const outPath = path.join(HERE, "probe-result.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        headed: HEADED,
        browser: browserVersion,
        systemChromeVersion: execSync(
          `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version`
        )
          .toString()
          .trim(),
        playwrightVersion: JSON.parse(
          fs.readFileSync(
            path.join(HERE, "node_modules/playwright/package.json"),
            "utf8"
          )
        ).version,
        results,
        announceLog: log,
      },
      null,
      2
    )
  );
  console.log(`\n結果 : ${outPath}`);
  console.log(`動画 : ${path.join(ARTIFACT_DIR, "video")}`);
  console.log(`トレース: npx playwright show-trace ${path.join(ARTIFACT_DIR, "trace-before-restart.zip")}`);
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
