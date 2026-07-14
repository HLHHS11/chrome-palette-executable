import "./VerticalTabsView.scss";

import { timeAgo } from "@pages/lib/time-ago";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import { tinykeys } from "tinykeys";

import type { VerticalTabItem } from "./types";

export default function VerticalTabsView(props: {
  items: () => readonly VerticalTabItem[];
  onSelect: (item: VerticalTabItem) => void;
}) {
  const [selectedIInternal, setSelectedI] = createSignal(0);
  let rootRef: HTMLDivElement | undefined;
  const selectedI = createMemo(() => {
    const n = props.items().length;
    if (n <= 0) return 0;
    return ((selectedIInternal() % n) + n) % n;
  });

  createEffect(() => {
    props.items();
    setSelectedI(0);
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
      setSelectedI((i) => i - 1);
    },
    ArrowDown: (e) => {
      if (e.isComposing) return;
      e.preventDefault();
      setSelectedI((i) => i + 1);
    },
    Enter: (e) => {
      if (e.isComposing) return;
      e.preventDefault();
      const item = props.items()[selectedI()];
      if (item) props.onSelect(item);
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
              </div>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
