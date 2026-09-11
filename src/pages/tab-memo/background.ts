import { createTabsRpcClient } from "@core/rpc";
import type {
  RpcHandlerContext,
  RpcResponse,
  RpcVoidResponseBody,
} from "@core/rpc";

import { routes as contentRoutes } from "../content/routes";
import { TabMemoService } from "./service";
import type {
  OrphanTabMemo,
  TabMemo,
  TabMemoDisplayState,
  TabMemoLayout,
  TabMemoSummary,
} from "./types";

const service = new TabMemoService();
const callContentRpc = createTabsRpcClient<typeof contentRoutes>();

/**
 * ページ上の表示を作り直させる。
 *
 * パレットからメモを作成・変更したときは、そのタブの content script が
 * 変更を知らないため明示的に伝える。`chrome://` などでは content script が
 * 動いておらず失敗するが、それは想定内なので握りつぶす。
 */
function isFromOwnTab(tabId: number, context: RpcHandlerContext): boolean {
  return context.sender?.tab?.id === tabId;
}

function refreshOverlay(tabId: number): void {
  void callContentRpc({ name: "tabMemo.refreshOverlay" }, { tabId }).catch(
    () => undefined
  );
}

function reportFailure(phase: string, error: unknown): void {
  console.error(`Tab memo ${phase} failed. Details:`, error);
}

/**
 * 操作対象の tabId を決める。
 *
 * content script は自分の tabId を知らないので、省略された場合は
 * メッセージの送り主のタブを対象にする。パレットなど別コンテキストから
 * 呼ぶときは明示的に渡す。
 */
function resolveTabId(
  tabId: number | undefined,
  context: RpcHandlerContext
): number | null {
  const resolved = tabId ?? context.sender?.tab?.id;
  if (!Number.isInteger(resolved) || (resolved as number) < 0) return null;
  return resolved as number;
}

export function bindTabMemo(): void {
  // 新しいブラウザセッションの開始時に、保持しているメモを開いているタブへ結び直す。
  chrome.runtime.onStartup.addListener(() => {
    void service
      .rematchAll()
      .catch((error) => reportFailure("session rematch", error));
  });

  // タブを閉じても本文は捨てない。結びつきだけ解いて孤児として残す。
  chrome.tabs.onRemoved.addListener((tabId) => {
    void service.detach(tabId).catch((error) => reportFailure("detach", error));
  });

  // 再結合の手がかりを新鮮に保つ。URL・タイトル・位置のいずれかが変わったら更新する。
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url === undefined && changeInfo.title === undefined) return;
    void service
      .syncBinding(tabId)
      .catch((error) => reportFailure("binding sync", error));
  });
  chrome.tabs.onMoved.addListener((tabId) => {
    void service
      .syncBinding(tabId)
      .catch((error) => reportFailure("binding sync", error));
  });
}

export async function getTabMemo(
  params: { tabId?: number },
  context: RpcHandlerContext
): Promise<RpcResponse<{ memo: TabMemo | null }>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  const memo = await service.get(tabId);
  return { ok: true, data: { memo: memo ?? null } };
}

export async function setTabMemoText(
  params: { tabId?: number; text: string },
  context: RpcHandlerContext
): Promise<RpcResponse<{ memo: TabMemo }>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  if (typeof params.text !== "string") {
    return { ok: false, error: "Invalid text." };
  }
  const memo = await service.setText(tabId, params.text);
  // そのタブ自身の入力が発生源なら再描画しない。入力中に値を差し戻すと
  // カーソル位置が飛んでしまうため。
  if (!isFromOwnTab(tabId, context)) refreshOverlay(tabId);
  return { ok: true, data: { memo } };
}

export async function updateTabMemoLayout(
  params: { tabId?: number; layout: Partial<TabMemoLayout> },
  context: RpcHandlerContext
): Promise<RpcResponse<{ memo: TabMemo | null }>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  const memo = await service.updateLayout(tabId, params.layout ?? {});
  return { ok: true, data: { memo: memo ?? null } };
}

export async function setTabMemoDisplayState(
  params: { tabId?: number; state: TabMemoDisplayState },
  context: RpcHandlerContext
): Promise<RpcResponse<{ memo: TabMemo | null }>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  if (
    params.state !== "minimized" &&
    params.state !== "normal" &&
    params.state !== "expanded"
  ) {
    return { ok: false, error: "Invalid display state." };
  }
  const memo = await service.setDisplayState(tabId, params.state);
  if (!isFromOwnTab(tabId, context)) refreshOverlay(tabId);
  return { ok: true, data: { memo: memo ?? null } };
}

export async function removeTabMemo(
  params: { tabId?: number },
  context: RpcHandlerContext
): Promise<RpcResponse<RpcVoidResponseBody>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  await service.remove(tabId);
  refreshOverlay(tabId);
  return { ok: true, data: {} };
}

export async function listTabMemos(): Promise<
  RpcResponse<{ memos: TabMemoSummary[] }>
> {
  return { ok: true, data: { memos: await service.listSummaries() } };
}

export async function listOrphanTabMemos(): Promise<
  RpcResponse<{ orphans: OrphanTabMemo[] }>
> {
  return { ok: true, data: { orphans: await service.listOrphans() } };
}

export async function adoptOrphanTabMemo(
  params: { recordId: string; tabId?: number },
  context: RpcHandlerContext
): Promise<RpcResponse<RpcVoidResponseBody>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  if (typeof params.recordId !== "string" || params.recordId.length === 0) {
    return { ok: false, error: "Invalid recordId." };
  }
  const adopted = await service.adoptOrphan(params.recordId, tabId);
  if (!adopted) return { ok: false, error: "Memo is already attached." };
  refreshOverlay(tabId);
  return { ok: true, data: {} };
}

export async function forgetOrphanTabMemo(params: {
  recordId: string;
}): Promise<RpcResponse<RpcVoidResponseBody>> {
  if (typeof params.recordId !== "string" || params.recordId.length === 0) {
    return { ok: false, error: "Invalid recordId." };
  }
  const forgotten = await service.forgetOrphan(params.recordId);
  if (!forgotten) return { ok: false, error: "Memo not found." };
  return { ok: true, data: {} };
}
