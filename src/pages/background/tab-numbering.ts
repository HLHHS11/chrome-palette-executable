import type { RpcResponse, RpcVoidResponseBody } from "@core/rpc";

// OSS (kg8m/chrome-show-tab-numbers) と同じ流儀で、"1. " のような番号付け接頭辞だけを
// document.title から正規表現で剥がして元タイトルを復元する方式。
//
// タイトル変更は chrome.scripting.executeScript ではなく chrome.tabs.sendMessage で
// 各タブに既に注入済みの content script に依頼する。executeScript は host_permissions が
// 無いと https 等の多くのページで失敗する一方、content_scripts が <all_urls> で入っている
// タブならメッセージは届くため。

const NUMBERING_SAFETY_TIMEOUT_MS = 10_000;

// 適用中ウィンドウの管理状態。
// - showing が立っている間に「同一ウィンドウ内でアクティブタブが変わった」(= Cmd+数字 で
//   タブ切り替えが起きた等) を検知したら強制 hide する。
// - safety timeout (10s) でも強制 hide する。
let activeWindowId: number | null = null;
let safetyTimerId: number | null = null;

function clearSafetyTimer(): void {
  if (safetyTimerId !== null) {
    clearTimeout(safetyTimerId);
    safetyTimerId = null;
  }
}

async function sendApplyTitleToTab(
  tabId: number,
  number: number
): Promise<void> {
  // chrome:// 等の content script 非注入タブには届かないので失敗は握りつぶす。
  await chrome.tabs
    .sendMessage(tabId, {
      name: "tabNumbering.applyTitleInFrame",
      number,
    })
    .catch(() => undefined);
}

async function sendRestoreTitleToTab(tabId: number): Promise<void> {
  await chrome.tabs
    .sendMessage(tabId, { name: "tabNumbering.restoreTitleInFrame" })
    .catch(() => undefined);
}

async function applyNumbersToAllTabsInActiveWindow(): Promise<void> {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!activeTab || activeTab.windowId === undefined) return;
  activeWindowId = activeTab.windowId;

  const tabs = await chrome.tabs.query({ windowId: activeWindowId });
  const collapsedGroupIds = await chrome.tabGroups
    .query({ windowId: activeWindowId, collapsed: true })
    .then((groups) => new Set(groups.map((g) => g.id)))
    .catch(() => new Set<number>());

  const visibleTabs = tabs
    .slice()
    .sort((a, b) => a.index - b.index)
    .filter((t) => !collapsedGroupIds.has(t.groupId));

  // Chrome 標準の Cmd+数字 のルールに合わせる:
  // - 1..8 番目: 1..8
  // - 9 番目以降: 中間タブは番号なし。最後のタブは 9
  await Promise.all(
    visibleTabs.map((tab, idx) => {
      if (tab.id === undefined) return;
      const isLast = idx === visibleTabs.length - 1;
      const number = idx < 8 ? idx + 1 : isLast ? 9 : null;
      if (number === null) return;
      return sendApplyTitleToTab(tab.id, number);
    })
  );
}

async function restoreNumbersInActiveWindow(): Promise<void> {
  if (activeWindowId === null) return;
  const windowIdToRestore = activeWindowId;
  activeWindowId = null;
  clearSafetyTimer();

  const tabs = await chrome.tabs.query({ windowId: windowIdToRestore });
  await Promise.all(
    tabs.map((tab) => {
      if (tab.id === undefined) return;
      return sendRestoreTitleToTab(tab.id);
    })
  );
}

export async function showTabNumbers(): Promise<
  RpcResponse<RpcVoidResponseBody>
> {
  await applyNumbersToAllTabsInActiveWindow();

  // safety timeout: keyup を取り逃しても確実に hide される保険。
  clearSafetyTimer();
  safetyTimerId = setTimeout(() => {
    void restoreNumbersInActiveWindow();
  }, NUMBERING_SAFETY_TIMEOUT_MS) as unknown as number;

  return { ok: true, data: {} };
}

export async function hideTabNumbers(): Promise<
  RpcResponse<RpcVoidResponseBody>
> {
  await restoreNumbersInActiveWindow();
  return { ok: true, data: {} };
}

// Cmd+数字 でタブ切り替えされた場合、 keyup が元タブで取れず numbering が残ることがある。
// 同一ウィンドウ内でアクティブタブが変わったときだけ強制 hide する (別ウィンドウの
// onActivated で誤って消さない)。
export function bindTabNumberingAutoHide(): void {
  chrome.tabs.onActivated.addListener((info) => {
    if (activeWindowId === null) return;
    if (info.windowId !== activeWindowId) return;
    void restoreNumbersInActiveWindow();
  });
}
