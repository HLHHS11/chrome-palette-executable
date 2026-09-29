import "./TimerListView.scss";

import { createRuntimeRpcClient } from "@core/rpc";
import type { backgroundRoutes } from "@pages/background/routes";
import { formatRemaining } from "@pages/timer";
import type { TimerEntry } from "@pages/timer";
import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { tinykeys } from "tinykeys";

import { closeTimerView } from "./view-intent";

const callBackgroundRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

/** 残り時間を描き直す間隔。秒の変わり目に遅れて見えない程度に細かく刻む。 */
const TICK_MS = 500;

/**
 * 仕掛けているタイマーの一覧。
 *
 * Enter で待っていたタブへ戻り、Control+x でタイマーを止める。
 * タブが閉じられていたタイマーは、Enter でその URL を開き直す。
 */
export default function TimerListView() {
  const [entries, { refetch }] = createResource<TimerEntry[]>(async () => {
    const response = await callBackgroundRpc({ name: "timer.listAll" });
    if (!response.ok || !("data" in response)) return [];
    return response.data.entries;
  });

  const [now, setNow] = createSignal(Date.now());
  const [selectedInternal, setSelectedInternal] = createSignal(0);

  const rows = createMemo(() => entries() ?? []);
  const selectedIndex = createMemo(() => {
    const count = rows().length;
    if (count <= 0) return 0;
    return ((selectedInternal() % count) + count) % count;
  });

  const activate = async (entry: TimerEntry | undefined): Promise<void> => {
    if (!entry) return;
    if (entry.tabId !== undefined) {
      const tab = await chrome.tabs.get(entry.tabId).catch(() => undefined);
      if (tab) {
        await chrome.tabs.update(entry.tabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        window.close();
        return;
      }
    }
    if (entry.url) await chrome.tabs.create({ url: entry.url });
    window.close();
  };

  const stop = async (entry: TimerEntry | undefined): Promise<void> => {
    if (!entry) return;
    await callBackgroundRpc({ name: "timer.remove", timerId: entry.timer.id });
    await refetch();
  };

  onMount(() => {
    const ticking = setInterval(() => setNow(Date.now()), TICK_MS);
    const unsubscribe = tinykeys(window, {
      ArrowUp: (event) => {
        event.preventDefault();
        setSelectedInternal((index) => index - 1);
      },
      ArrowDown: (event) => {
        event.preventDefault();
        setSelectedInternal((index) => index + 1);
      },
      Enter: (event) => {
        event.preventDefault();
        void activate(rows()[selectedIndex()]);
      },
      "Control+x": (event) => {
        event.preventDefault();
        void stop(rows()[selectedIndex()]);
      },
      Escape: (event) => {
        event.preventDefault();
        closeTimerView();
      },
    });
    onCleanup(() => {
      clearInterval(ticking);
      unsubscribe();
    });
  });

  const remainingOf = (entry: TimerEntry): string =>
    entry.timer.status === "fired"
      ? "終了"
      : formatRemaining(entry.timer.deadline - now());

  return (
    <div class="TimerList">
      <div class="timer_list_header">
        <span>タイマー</span>
        <span class="timer_list_hint">
          Enter で移動 / Control+x で停止 / Esc で戻る
        </span>
      </div>
      <Show
        when={rows().length > 0}
        fallback={
          <div class="timer_list_empty">仕掛けているタイマーはありません</div>
        }
      >
        <div class="timer_list_rows">
          <For each={rows()}>
            {(entry, index) => (
              <div
                class="timer_row"
                classList={{
                  selected: index() === selectedIndex(),
                  fired: entry.timer.status === "fired",
                }}
                onClick={() => void activate(entry)}
              >
                <span class="timer_remaining">{remainingOf(entry)}</span>
                <div class="timer_body">
                  <div class="timer_title">
                    {entry.timer.title || "(タイトルなし)"}
                  </div>
                  <div class="timer_origin">
                    {entry.tabId === undefined
                      ? `${entry.tabTitle || entry.url} · タブは閉じられています`
                      : entry.tabTitle}
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
