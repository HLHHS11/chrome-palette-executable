import { createTabsRpcClient } from "@core/rpc";
import type {
  RpcHandlerContext,
  RpcResponse,
  RpcVoidResponseBody,
} from "@core/rpc";

import { routes as contentRoutes } from "../content/routes";
import { MemoService } from "./service";
import type { Memo, MemoLayout, MemoSummary, OrphanMemo } from "./types";

const service = new MemoService();
const callContentRpc = createTabsRpcClient<typeof contentRoutes>();

function isFromOwnTab(tabId: number, context: RpcHandlerContext): boolean {
  return context.sender?.tab?.id === tabId;
}

/**
 * ページ上の表示を作り直させる。パレットから変更しても、そのタブは気付けない。
 * content script が動いていないページでは失敗するが、それは想定内。
 */
function refreshOverlay(tabId: number): void {
  void callContentRpc({ name: "memo.refreshOverlay" }, { tabId }).catch(
    () => undefined
  );
}

function reportFailure(phase: string, error: unknown): void {
  console.error(`Memo ${phase} failed. Details:`, error);
}

/**
 * 操作対象の tabId を決める。
 * content script は自分の tabId を知らないので、省略時は送り主のタブを使う。
 */
function resolveTabId(
  tabId: number | undefined,
  context: RpcHandlerContext
): number | null {
  const resolved = tabId ?? context.sender?.tab?.id;
  if (!Number.isInteger(resolved) || (resolved as number) < 0) return null;
  return resolved as number;
}

export function bindMemo(): void {
  // tabId は再起動を跨いで安定しないので、開き直されたタブへ結び直す。
  chrome.runtime.onStartup.addListener(() => {
    void service
      .rematchAll()
      .catch((error) => reportFailure("session rematch", error));
  });

  // タブを閉じても本文は捨てない。結びつきだけ解く。
  chrome.tabs.onRemoved.addListener((tabId) => {
    void service.detach(tabId).catch((error) => reportFailure("detach", error));
  });

  // 再結合の手がかりを新鮮に保つ。
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

export async function getMemo(
  params: { tabId?: number },
  context: RpcHandlerContext
): Promise<RpcResponse<{ memo: Memo | null }>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  const memo = await service.get(tabId);
  return { ok: true, data: { memo: memo ?? null } };
}

export async function setMemoText(
  params: { tabId?: number; text: string },
  context: RpcHandlerContext
): Promise<RpcResponse<{ memo: Memo }>> {
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

export async function updateMemoLayout(
  params: { tabId?: number; layout: Partial<MemoLayout> },
  context: RpcHandlerContext
): Promise<RpcResponse<{ memo: Memo | null }>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  const memo = await service.updateLayout(tabId, params.layout ?? {});
  return { ok: true, data: { memo: memo ?? null } };
}

export async function toggleMemoSize(
  params: { tabId?: number },
  context: RpcHandlerContext
): Promise<RpcResponse<{ memo: Memo | null }>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  const memo = await service.toggleMinimized(tabId);
  if (!memo) return { ok: false, error: "このタブにはメモがありません。" };
  if (!isFromOwnTab(tabId, context)) refreshOverlay(tabId);
  return { ok: true, data: { memo } };
}

/**
 * メモを編集できる状態にして、そこへカーソルを移す。
 * 入力欄はページ上に置く。パレットはすぐ閉じるので書く場所にならない。
 */
export async function editMemo(
  params: { tabId?: number },
  context: RpcHandlerContext
): Promise<RpcResponse<{ memo: Memo }>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  const memo = await service.prepareForEditing(tabId);
  const focused = await callContentRpc(
    { name: "memo.focusOverlay" },
    { tabId }
  ).catch(() => null);
  // content script が動いていないページでは表示できない。保存自体は済んでいる。
  if (!focused) {
    return { ok: false, error: "このページにはメモを表示できません。" };
  }
  return { ok: true, data: { memo } };
}

export async function removeMemo(
  params: { tabId?: number },
  context: RpcHandlerContext
): Promise<RpcResponse<RpcVoidResponseBody>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  await service.remove(tabId);
  refreshOverlay(tabId);
  return { ok: true, data: {} };
}

export async function listMemos(): Promise<
  RpcResponse<{ memos: MemoSummary[] }>
> {
  return { ok: true, data: { memos: await service.listSummaries() } };
}

export async function listOrphanMemos(
  params: { tabId?: number },
  context: RpcHandlerContext
): Promise<RpcResponse<{ orphans: OrphanMemo[] }>> {
  const tabId = resolveTabId(params.tabId, context);
  if (tabId === null) return { ok: false, error: "Invalid tabId." };
  return { ok: true, data: { orphans: await service.listOrphansFor(tabId) } };
}

export async function adoptOrphanMemo(
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

export async function forgetOrphanMemo(params: {
  recordId: string;
}): Promise<RpcResponse<RpcVoidResponseBody>> {
  if (typeof params.recordId !== "string" || params.recordId.length === 0) {
    return { ok: false, error: "Invalid recordId." };
  }
  const forgotten = await service.forgetOrphan(params.recordId);
  if (!forgotten) return { ok: false, error: "Memo not found." };
  return { ok: true, data: {} };
}
