import "./MemoColorPickerView.scss";

import { createRuntimeRpcClient } from "@core/rpc";
import type { backgroundRoutes } from "@pages/background/routes";
import {
  MEMO_COLORS,
  MEMO_COLOR_LABELS,
  MEMO_DEFAULT_COLOR,
  type MemoColor,
} from "@pages/memo";
import { For, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { tinykeys } from "tinykeys";

import { closeMemoColorPicker } from "./view-intent";

const callBackgroundRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

/**
 * メモ色の詳細選択。5 色を矢印キーまたはクリックで選び、Enter で確定する。
 */
export default function MemoColorPickerView(props: {
  initialColor: MemoColor | null;
}) {
  const initialIndex = Math.max(
    0,
    MEMO_COLORS.indexOf(props.initialColor ?? MEMO_DEFAULT_COLOR)
  );
  const [selectedInternal, setSelectedInternal] = createSignal(initialIndex);
  const [error, setError] = createSignal("");

  const selectedIndex = createMemo(() => {
    const count = MEMO_COLORS.length;
    return ((selectedInternal() % count) + count) % count;
  });

  const apply = async (color: MemoColor): Promise<void> => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (tab?.id === undefined) throw new Error("Could not get active tab.");
      const response = await callBackgroundRpc({
        name: "memo.setColor",
        tabId: tab.id,
        color,
      });
      if (!response.ok) throw new Error(response.error);
      window.close();
    } catch (e: unknown) {
      setError(`エラーが発生しました。詳細: ${e}`);
    }
  };

  onMount(() => {
    const unsubscribe = tinykeys(window, {
      ArrowUp: (event) => {
        event.preventDefault();
        setSelectedInternal((index) => index - 1);
      },
      ArrowDown: (event) => {
        event.preventDefault();
        setSelectedInternal((index) => index + 1);
      },
      ArrowLeft: (event) => {
        event.preventDefault();
        setSelectedInternal((index) => index - 1);
      },
      ArrowRight: (event) => {
        event.preventDefault();
        setSelectedInternal((index) => index + 1);
      },
      Enter: (event) => {
        event.preventDefault();
        void apply(MEMO_COLORS[selectedIndex()]);
      },
      Escape: (event) => {
        event.preventDefault();
        closeMemoColorPicker();
      },
    });
    onCleanup(unsubscribe);
  });

  return (
    <div class="MemoColorPicker">
      <div class="memo_color_picker_header">
        <span>メモの色</span>
        <span class="memo_color_picker_hint">
          Enter で設定 / Esc で戻る
        </span>
      </div>
      <div class="memo_color_picker_rows">
        <For each={[...MEMO_COLORS]}>
          {(color, index) => (
            <div
              class="memo_color_row"
              classList={{ selected: selectedIndex() === index() }}
              onClick={() => void apply(color)}
            >
              <span
                class="memo_color_swatch"
                data-memo-color={color}
                aria-hidden="true"
              />
              <span class="memo_color_label">{MEMO_COLOR_LABELS[color]}</span>
              <span class="memo_color_name">{color}</span>
            </div>
          )}
        </For>
      </div>
      {error() ? <div class="memo_color_picker_error">{error()}</div> : null}
    </div>
  );
}
