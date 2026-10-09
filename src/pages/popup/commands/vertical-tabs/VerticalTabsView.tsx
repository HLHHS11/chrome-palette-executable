import "./VerticalTabsView.scss";

import { timeAgo } from "@pages/lib/time-ago";
import { For, Show, createEffect, createSignal, onMount } from "solid-js";
import { tinykeys } from "tinykeys";

import type { VerticalTabItem } from "./types";

export default function VerticalTabsView(props: {
  items: () => readonly VerticalTabItem[];
  onSelect: (item: VerticalTabItem) => void;
  onClose: (item: VerticalTabItem) => void;
}) {
  const [selectedI, setSelectedI] = createSignal(0);
  let rootRef: HTMLDivElement | undefined;
  const moveSelection = (delta: number) => {
    const n = props.items().length;
    if (n <= 0) return;
    setSelectedI((i) => (((i + delta) % n) + n) % n);
  };

  // タブを閉じて一覧が縮んでも、選択位置はその場に留める。
  createEffect(() => {
    const n = props.items().length;
    setSelectedI((i) => Math.max(0, Math.min(i, n - 1)));
  });

  onMount(() => {
    requestAnimationFrame(() => {
      rootRef?.focus();
    });
  });

  tinykeys(window, {
    ArrowUp: (e) => {
      if (e.isComposing) return;
      e.preventDefault();
      moveSelection(-1);
    },
    ArrowDown: (e) => {
      if (e.isComposing) return;
      e.preventDefault();
      moveSelection(1);
    },
    Enter: (e) => {
      if (e.isComposing) return;
      e.preventDefault();
      const item = props.items()[selectedI()];
      if (item) props.onSelect(item);
    },
    "Control+x": (e) => {
      if (e.isComposing) return;
      e.preventDefault();
      const item = props.items()[selectedI()];
      if (item) props.onClose(item);
    },
  });

  return (
    <div class="VerticalTabs" tabIndex={-1} ref={rootRef}>
      <ul class="vertical_tabs_list">
        <For each={props.items()}>
          {(item, i) => (
            <li
              class="VerticalTabEntry"
              classList={{
                selected: i() === selectedI(),
                [`duplicate_${item.duplicateHighlightColor}`]:
                  item.duplicateHighlightColor !== null,
              }}
              onClick={() => props.onSelect(item)}
              ref={(el) => {
                createEffect(() => {
                  if (i() === selectedI()) {
                    el.scrollIntoView({ behavior: "auto", block: "nearest" });
                  }
                });
              }}
            >
              <Show
                when={item.faviconUrl}
                fallback={<span class="vertical_tab_icon" />}
              >
                {(icon) => (
                  <img
                    class="vertical_tab_icon"
                    src={icon()}
                    alt=""
                    loading="lazy"
                  />
                )}
              </Show>
              <div class="vertical_tab_number">{item.shortcutNumber ?? ""}</div>
              <div class="vertical_tab_text">
                <div class="vertical_tab_title">{item.title}</div>
                <div class="vertical_tab_url">
                  {item.url}
                  <Show when={item.lastAccessed}>
                    {(time) => (
                      <span class="vertical_tab_time">{timeAgo(time())}</span>
                    )}
                  </Show>
                </div>
                <Show when={item.memo}>
                  {(memo) => (
                    <div
                      class="vertical_tab_memo"
                      title={memo()}
                      data-memo-color={item.memoColor ?? "yellow"}
                    >
                      {memo()}
                    </div>
                  )}
                </Show>
              </div>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
