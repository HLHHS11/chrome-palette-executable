import "./TabRetentionView.scss";

import { createRuntimeRpcClient } from "@core/rpc";
import type { backgroundRoutes } from "@pages/background/routes";
import { timeAgo } from "@pages/lib/time-ago";
import type {
  AutoDeletedTabRecord,
  TabRetention,
  TabRetentionCategory,
  TabRetentionTabItem,
  UnmatchedManualProtection,
} from "@pages/tab-retention";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onMount,
} from "solid-js";
import { tinykeys } from "tinykeys";

import ConfirmDialog from "../../components/ConfirmDialog";
import { faviconURL } from "../../util/favicon";

type TabRow = { kind: "tab"; item: TabRetentionTabItem };
type DeletedRow = { kind: "deleted"; item: AutoDeletedTabRecord };
type UnmatchedManualRow = {
  kind: "unmatched-manual";
  item: UnmatchedManualProtection;
};
type ViewRow = TabRow | DeletedRow | UnmatchedManualRow;

const categories: ReadonlyArray<{
  id: TabRetentionCategory;
  label: string;
  key: string;
}> = [
  { id: "closing", label: "削除予定", key: "1" },
  { id: "auto", label: "自動保持", key: "2" },
  { id: "manual", label: "明示保持", key: "3" },
  { id: "deleted", label: "最近削除", key: "4" },
];

const callBackgroundRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

function formatDuration(durationMs: number): string {
  const minutes = Math.max(0, Math.floor(durationMs / 60_000));
  if (minutes < 1) return "1分未満";
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours}時間`
    : `${hours}時間${remainingMinutes}分`;
}

function describeTab(item: TabRetentionTabItem, now: number): string {
  const assessment = item.assessment;
  if (assessment.kind === "manual-protected") return "明示保持";
  if (assessment.kind === "stale-recommended") return "削除を推奨";
  if (assessment.kind === "auto-protected") {
    return item.autoProtectionReason === "active-time"
      ? `滞在${formatDuration(item.totalForegroundMs)}で保持`
      : `${item.foregroundVisitCount}回の訪問で保持`;
  }
  if (assessment.kind === "observe-only") {
    return "監視期間中・本来は削除対象";
  }
  if (assessment.kind === "delete-eligible") return "次回の掃除で削除";
  if (assessment.kind === "waiting") {
    return `削除まで約${formatDuration(assessment.deleteAt - now)}`;
  }

  const reasonLabels: Record<typeof assessment.reason, string> = {
    active: "表示中のため保留",
    pinned: "Chrome固定タブのため保留",
    audible: "音声再生中のため保留",
    incognito: "シークレットタブのため対象外",
    "extension-page": "拡張機能ページのため対象外",
  };
  return reasonLabels[assessment.reason];
}

/** 削除確認では、メモを本文ごと見せる。消す前に読めないと意味がない。 */
function buildConfirmMessage(
  item: TabRetentionTabItem,
  memo: string | undefined
): string {
  const base = `「${item.title}」を閉じます。\n${item.url}`;
  if (!memo) return base;
  return `${base}\n\nこのタブのメモ:\n${memo}`;
}

export default function TabRetentionView(props: {
  initialCategory: TabRetentionCategory;
}) {
  const [category, setCategory] = createSignal(props.initialCategory);
  const [query, setQuery] = createSignal("");
  const [selectedInternal, setSelectedInternal] = createSignal(0);
  const [error, setError] = createSignal("");
  const [pendingDeletion, setPendingDeletion] =
    createSignal<TabRetentionTabItem>();
  let rootRef: HTMLDivElement | undefined;
  let searchRef: HTMLInputElement | undefined;

  const [overview, { refetch }] = createResource(async () => {
    const response = await callBackgroundRpc({
      name: "tabRetention.listOverview",
    });
    if (!response.ok) throw new Error(response.error);
    if (!("data" in response)) throw new Error(response.info);
    return response.data.overview;
  });

  /** tabId -> メモ本文。一覧・検索・削除確認で共用する。 */
  const [memos] = createResource(async () => {
    const response = await callBackgroundRpc({ name: "memo.list" });
    if (!response.ok || !("data" in response)) return new Map<number, string>();
    return new Map(response.data.memos.map(({ tabId, text }) => [tabId, text]));
  });

  const memoOf = (tabId: number): string | undefined => memos()?.get(tabId);

  const confirmMessage = (item: TabRetentionTabItem): string =>
    buildConfirmMessage(item, memoOf(item.tabId));

  const rows = createMemo<ViewRow[]>(() => {
    const current = overview();
    if (!current) return [];
    const normalizedQuery = query().trim().toLowerCase();
    const currentCategory = category();

    if (currentCategory === "deleted") {
      return current.recentlyDeleted
        .filter((item) =>
          `${item.title}\n${item.url}`.toLowerCase().includes(normalizedQuery)
        )
        .map((item) => ({ kind: "deleted", item }));
    }

    const expectedRetention: TabRetention =
      currentCategory === "closing"
        ? "normal"
        : currentCategory === "auto"
          ? "auto-protected"
          : "manual-protected";
    const liveRows: ViewRow[] = current.tabs
      .filter((item) => item.retention === expectedRetention)
      .filter((item) =>
        `${item.title}\n${item.url}\n${memoOf(item.tabId) ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .sort((a, b) => {
        if (currentCategory === "closing") {
          const aDeleteAt =
            "deleteAt" in a.assessment
              ? a.assessment.deleteAt
              : Number.POSITIVE_INFINITY;
          const bDeleteAt =
            "deleteAt" in b.assessment
              ? b.assessment.deleteAt
              : Number.POSITIVE_INFINITY;
          return aDeleteAt - bDeleteAt;
        }
        if (currentCategory === "auto") {
          const aStale = a.assessment.kind === "stale-recommended" ? 0 : 1;
          const bStale = b.assessment.kind === "stale-recommended" ? 0 : 1;
          if (aStale !== bStale) return aStale - bStale;
        }
        return a.lastUsedAt - b.lastUsedAt;
      })
      .map((item) => ({ kind: "tab", item }));
    if (currentCategory !== "manual") return liveRows;
    return [
      ...liveRows,
      ...current.unmatchedManual
        .filter((item) =>
          `${item.title}\n${item.url}`.toLowerCase().includes(normalizedQuery)
        )
        .map(
          (item): UnmatchedManualRow => ({
            kind: "unmatched-manual",
            item,
          })
        ),
    ];
  });

  const selectedIndex = createMemo(() => {
    const count = rows().length;
    if (count === 0) return 0;
    return ((selectedInternal() % count) + count) % count;
  });

  createEffect(() => {
    category();
    query();
    overview();
    memos();
    setSelectedInternal(0);
  });

  const activateRow = async (row: ViewRow | undefined) => {
    if (!row) return;
    setError("");
    try {
      if (row.kind === "unmatched-manual") {
        const response = await callBackgroundRpc({
          name: "tabRetention.reopenUnmatchedManual",
          recordId: row.item.recordId,
          url: row.item.url,
        });
        if (!response.ok) throw new Error(response.error);
        window.close();
        return;
      }
      if (row.kind === "tab") {
        await chrome.tabs.update(row.item.tabId, { active: true });
        await chrome.windows.update(row.item.windowId, { focused: true });
        window.close();
        return;
      }
      if (row.item.restoredAt !== undefined) return;
      const response = await callBackgroundRpc({
        name: "tabRetention.restoreDeleted",
        deletionId: row.item.deletionId,
      });
      if (!response.ok) throw new Error(response.error);
      window.close();
    } catch (e: unknown) {
      setError(`エラーが発生しました。詳細: ${e}`);
    }
  };

  const changeProtection = async (
    row: ViewRow | undefined,
    retention: "normal" | "manual-protected"
  ) => {
    if (!row) return;
    setError("");
    try {
      if (row.kind === "unmatched-manual") {
        if (retention !== "normal") return;
        const response = await callBackgroundRpc({
          name: "tabRetention.forgetUnmatchedManual",
          recordId: row.item.recordId,
        });
        if (!response.ok) throw new Error(response.error);
        await refetch();
        return;
      }
      if (row.kind !== "tab") return;
      const response = await callBackgroundRpc({
        name: "tabRetention.setProtection",
        tabId: row.item.tabId,
        retention,
      });
      if (!response.ok) throw new Error(response.error);
      await refetch();
    } catch (e: unknown) {
      setError(`エラーが発生しました。詳細: ${e}`);
    }
  };

  const deletePendingTab = async () => {
    const item = pendingDeletion();
    if (!item) return;
    setPendingDeletion(undefined);
    setError("");
    try {
      await chrome.tabs.remove(item.tabId);
      await refetch();
      requestAnimationFrame(() => rootRef?.focus());
    } catch (e: unknown) {
      setError(`エラーが発生しました。詳細: ${e}`);
      requestAnimationFrame(() => rootRef?.focus());
    }
  };

  const cancelPendingDeletion = () => {
    setPendingDeletion(undefined);
    requestAnimationFrame(() => rootRef?.focus());
  };

  onMount(() => requestAnimationFrame(() => rootRef?.focus()));

  const isSearching = () => document.activeElement === searchRef;
  tinykeys(window, {
    ArrowUp: (event) => {
      if (event.isComposing) return;
      event.preventDefault();
      setSelectedInternal((index) => index - 1);
    },
    ArrowDown: (event) => {
      if (event.isComposing) return;
      event.preventDefault();
      setSelectedInternal((index) => index + 1);
    },
    ArrowLeft: (event) => {
      if (isSearching() || event.isComposing) return;
      event.preventDefault();
      const currentIndex = categories.findIndex(
        (item) => item.id === category()
      );
      setCategory(
        categories[(currentIndex - 1 + categories.length) % categories.length]
          .id
      );
    },
    ArrowRight: (event) => {
      if (isSearching() || event.isComposing) return;
      event.preventDefault();
      const currentIndex = categories.findIndex(
        (item) => item.id === category()
      );
      setCategory(categories[(currentIndex + 1) % categories.length].id);
    },
    Enter: (event) => {
      if (event.isComposing) return;
      event.preventDefault();
      void activateRow(rows()[selectedIndex()]);
    },
    "/": (event) => {
      if (isSearching()) return;
      event.preventDefault();
      searchRef?.focus();
    },
    Escape: (event) => {
      if (!isSearching()) return;
      event.preventDefault();
      setQuery("");
      rootRef?.focus();
    },
    p: (event) => {
      if (isSearching() || event.isComposing) return;
      event.preventDefault();
      const row = rows()[selectedIndex()];
      const retention =
        row?.kind === "tab" && row.item.retention === "manual-protected"
          ? "normal"
          : "manual-protected";
      void changeProtection(row, retention);
    },
    u: (event) => {
      if (isSearching() || event.isComposing) return;
      event.preventDefault();
      void changeProtection(rows()[selectedIndex()], "normal");
    },
    "Control+x": (event) => {
      if (isSearching() || event.isComposing) return;
      const row = rows()[selectedIndex()];
      if (row?.kind !== "tab") return;
      event.preventDefault();
      setPendingDeletion(row.item);
    },
    1: (event) => {
      if (isSearching()) return;
      event.preventDefault();
      setCategory("closing");
    },
    2: (event) => {
      if (isSearching()) return;
      event.preventDefault();
      setCategory("auto");
    },
    3: (event) => {
      if (isSearching()) return;
      event.preventDefault();
      setCategory("manual");
    },
    4: (event) => {
      if (isSearching()) return;
      event.preventDefault();
      setCategory("deleted");
    },
  });

  const countForCategory = (target: TabRetentionCategory): number => {
    const current = overview();
    if (!current) return 0;
    if (target === "deleted") return current.recentlyDeleted.length;
    const retention: TabRetention =
      target === "closing"
        ? "normal"
        : target === "auto"
          ? "auto-protected"
          : "manual-protected";
    const liveCount = current.tabs.filter(
      (item) => item.retention === retention
    ).length;
    return target === "manual"
      ? liveCount + current.unmatchedManual.length
      : liveCount;
  };

  return (
    <div class="TabRetention" tabIndex={-1} ref={rootRef}>
      <div class="tab_retention_header">
        <div class="tab_retention_categories">
          <For each={categories}>
            {(item) => (
              <button
                type="button"
                classList={{ selected: category() === item.id }}
                onClick={() => {
                  setCategory(item.id);
                  rootRef?.focus();
                }}
              >
                <span class="category_key">{item.key}</span>
                {item.label}
                <span class="category_count">{countForCategory(item.id)}</span>
              </button>
            )}
          </For>
        </div>
        <input
          ref={searchRef}
          value={query()}
          placeholder="/  タイトル・URLを検索"
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      <Show
        when={
          overview() && overview()!.generatedAt < overview()!.observeOnlyUntil
        }
      >
        <div class="tab_retention_observe">
          初回監視中です。3時間は削除せず、対象だけを表示します。
        </div>
      </Show>
      <Show when={error()}>
        <div class="tab_retention_error">{error()}</div>
      </Show>
      <Show when={overview.error}>
        <div class="tab_retention_error">
          エラーが発生しました。詳細: {String(overview.error)}
        </div>
      </Show>

      <ul class="tab_retention_list">
        <Show
          when={!overview.loading}
          fallback={<li class="tab_retention_empty">読み込み中...</li>}
        >
          <For
            each={rows()}
            fallback={
              <li class="tab_retention_empty">該当するタブはありません</li>
            }
          >
            {(row, index) => {
              const title = () =>
                row.kind === "unmatched-manual"
                  ? row.item.title || "明示保持を復元できませんでした"
                  : row.item.title;
              const url = () => row.item.url;
              const icon = () =>
                row.kind === "tab"
                  ? row.item.faviconUrl || faviconURL(row.item.url)
                  : faviconURL(row.item.url);
              return (
                <li
                  class="TabRetentionEntry"
                  classList={{
                    selected: index() === selectedIndex(),
                    restored:
                      row.kind === "deleted" &&
                      row.item.restoredAt !== undefined,
                  }}
                  onClick={() => void activateRow(row)}
                  ref={(element) => {
                    createEffect(() => {
                      if (index() === selectedIndex()) {
                        element.scrollIntoView({
                          behavior: "auto",
                          block: "nearest",
                        });
                      }
                    });
                  }}
                >
                  <Show
                    when={icon()}
                    fallback={<span class="retention_icon" />}
                  >
                    {(source) => (
                      <img
                        class="retention_icon"
                        src={source()}
                        alt=""
                        loading="lazy"
                      />
                    )}
                  </Show>
                  <div class="retention_text">
                    <div class="retention_title">{title()}</div>
                    <div class="retention_url">{url()}</div>
                    <Show when={row.kind === "tab" && memoOf(row.item.tabId)}>
                      {(text) => (
                        <div class="retention_memo" title={text()}>
                          {text()}
                        </div>
                      )}
                    </Show>
                    <div class="retention_metrics">
                      {row.kind === "tab" ? (
                        <>
                          {describeTab(
                            row.item,
                            overview()?.generatedAt ?? Date.now()
                          )}
                          <span>最終利用 {timeAgo(row.item.lastUsedAt)}</span>
                          <span>
                            滞在 {formatDuration(row.item.totalForegroundMs)}・
                            {row.item.foregroundVisitCount}回
                          </span>
                          <Show when={row.item.discarded}>破棄済み</Show>
                          <Show when={row.item.frozen}>凍結中</Show>
                        </>
                      ) : row.kind === "deleted" ? (
                        <>
                          <span>削除 {timeAgo(row.item.deletedAt)}</span>
                          <span>最終利用 {timeAgo(row.item.lastUsedAt)}</span>
                          <span>
                            滞在 {formatDuration(row.item.totalForegroundMs)}・
                            {row.item.foregroundVisitCount}回
                          </span>
                          <Show when={row.item.restoredAt}>復元済み</Show>
                        </>
                      ) : (
                        <>
                          再起動後に一意のタブへ関連付けできませんでした・Enterで開き直す
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            }}
          </For>
        </Show>
      </ul>

      <div class="tab_retention_help">
        1–4・←→ 表示切替 · ↑↓ 選択 · Enter 移動・復元 · Ctrl+X 削除 · P 明示保持
        · U 自動削除へ戻す · / 検索
      </div>

      <Show when={pendingDeletion()}>
        {(item) => (
          <ConfirmDialog
            title="タブを削除しますか？"
            message={confirmMessage(item())}
            confirmLabel="削除"
            onConfirm={() => void deletePendingTab()}
            onCancel={cancelPendingDeletion}
          />
        )}
      </Show>
    </div>
  );
}
