import "./App.scss";

import type { Command } from "@core/command";
import InfiniteScroll from "solid-infinite-scroll";
import {
  type Accessor,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { tinykeys } from "tinykeys";

import Entry from "./Entry";
import Shortcut from "./Shortcut";
import { inputSignal } from "./util/signals";

const [inputValue, setInputValue] = inputSignal;

/**
 * popup を初めて開いたユーザがツールバーにピン留めしていない場合に出す警告。
 * popup の UX に閉じた話なので Shell に同居させる。
 */
function PinWarning() {
  const [userSettings] = createResource(() => chrome.action.getUserSettings());
  const isNotPinned = createMemo(
    () => userSettings() && userSettings()?.isOnToolbar === false
  );
  return (
    <Show when={isNotPinned()}>
      <div style={{ color: "red", padding: "10px" }}>
        Pin the extension to the toolbar for faster load
      </div>
    </Show>
  );
}

/**
 * リストのキーボードナビゲーションと展開状態を司る private なフック。
 *
 * - `↑` / `↓` で選択 index を modular に移動
 * - `Enter` で `onEnter` を呼ぶ
 * - `Space` で選択中行の展開トグル (入力欄にフォーカスがあるときは通常入力として透過)
 * - 入力文字列が変わったら選択と展開状態をリセット
 *
 * PaletteShell の動作を実現するための補助関数であり、他に共有する予定は無いので
 * 同じファイル内に閉じておく。汎用ジェネリックや `extraKeys` 引数のような将来の
 * 抽象は意図的に持たない (cpe-coding の YAGNI 原則)。
 */
function useListNavigation(
  getItems: Accessor<readonly Command[]>,
  onEnter: (item: Command) => void
) {
  const [selectedI_internal, setSelectedI] = createSignal(0);
  const [expandedSet, setExpandedSet] = createSignal<ReadonlySet<number>>(
    new Set()
  );

  const selectedI = createMemo(() => {
    const n = getItems().length;
    if (n <= 0) return 0;
    return ((selectedI_internal() % n) + n) % n;
  });

  createEffect(() => {
    inputValue();
    setSelectedI(0);
    setExpandedSet(new Set<number>());
  });

  const isInputFocused = () =>
    document.activeElement?.tagName === "INPUT" ||
    document.activeElement?.tagName === "TEXTAREA";

  tinykeys(window, {
    ArrowUp: (e) => {
      e.preventDefault();
      setSelectedI((i) => i - 1);
    },
    ArrowDown: (e) => {
      e.preventDefault();
      setSelectedI((i) => i + 1);
    },
    Enter: (e) => {
      e.preventDefault();
      const item = getItems()[selectedI()];
      if (item !== undefined) onEnter(item);
    },
    Space: (e) => {
      // 入力欄フォーカス中の Space は通常入力として透過させる。
      if (isInputFocused()) return;
      e.preventDefault();
      const idx = selectedI();
      const next = new Set<number>(expandedSet());
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      setExpandedSet(next);
    },
  });

  return {
    selectedI,
    isExpanded: (index: number) => expandedSet().has(index),
  };
}

/**
 * ポップアップの「コマンドパレット枠」の見た目を司るコンポーネント。
 *
 * 責務:
 * - 入力欄 / 結果リスト / ショートカット表示 / Pin 警告のレイアウト
 * - リストのキーボードナビゲーション (↑/↓/Enter/Space)
 * - リストの「もっと読み込む」トリガを親に通知 (`onLoadMore`)
 *
 * 一方、「どの Command を出すか」「Enter で何が起きるか」など、
 * アプリケーション固有のロジックは Shell の責務ではなく親 (App.tsx) が注入する。
 */
export default function PaletteShell(props: {
  /** 入力欄の右側に表示するショートカット文字列 (例: `⇧⌘P`)。 */
  shortcut: Accessor<string>;
  /** リストに表示する Command 配列。フィルタ済み・順序確定済み。 */
  commands: Accessor<Command[]>;
  /** クリック / Enter で発火するアクション。 */
  onSelect: (command: Command) => void;
  /** リスト末端到達時にもっと読み込む通知。 */
  onLoadMore: () => void;
}) {
  // TODO: #2 ↓以下、山口は全く理解してない
  // props.* を直接渡すと Solid lint が "tracked scope の外で reactive を参照" と警告する。
  // hook 側の createMemo / tinykeys ハンドラから呼ばれる時点 (= tracked / event 内) で
  // props を読み直すよう、薄いラッパーで包む。
  const nav = useListNavigation(
    () => props.commands(),
    (item) => props.onSelect(item)
  );

  return (
    <>
      <div
        class="App"
        onBlur={() => {
          window.close();
        }}
      >
        <div class="input_wrap">
          <input
            class="input"
            autofocus
            placeholder="Type to search..."
            value={inputValue()}
            onInput={(e) => {
              setInputValue(e.target.value);
            }}
          />
          <Shortcut
            onClick={() =>
              chrome.tabs.create({ url: "chrome://extensions/shortcuts" })
            }
            keys={props.shortcut()}
          />
        </div>
        <ul class="list">
          <InfiniteScroll
            loadingMessage={<></>}
            each={props.commands()}
            hasMore={true}
            next={props.onLoadMore}
          >
            {(command, i) => (
              <Entry
                isSelected={i() === nav.selectedI()}
                isExpanded={nav.isExpanded(i())}
                command={command}
                onSelect={props.onSelect}
              />
            )}
          </InfiniteScroll>
        </ul>
      </div>
      <PinWarning />
    </>
  );
}
