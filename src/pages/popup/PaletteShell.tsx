import "./App.scss";

import type { Command, CommandRunContext } from "@core/command";
import InfiniteScroll from "solid-infinite-scroll";
import {
  type Accessor,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { tinykeys } from "tinykeys";

import Entry from "./Entry";
import Shortcut from "./Shortcut";
import { inputSignal, takeInputSelectionRange } from "./util/signals";

const [inputValue, setInputValue] = inputSignal;

/**
 * リストのキーボードナビゲーションと展開状態を司る private なフック。
 *
 * - `↑` / `↓` で選択 index を modular に移動
 * - `Enter` / `Cmd+Enter` で `onEnter` を呼ぶ (どちらで押されたかを伝える)
 * - `Space` で選択中行の展開トグル (入力欄にフォーカスがあるときは通常入力として透過)
 * - 入力文字列が変わったら選択と展開状態をリセット
 *
 * PaletteShell の動作を実現するための補助関数であり、他に共有する予定は無いので
 * 同じファイル内に閉じておく。汎用ジェネリックや `extraKeys` 引数のような将来の
 * 抽象は意図的に持たない (cpe-coding の YAGNI 原則)。
 */
function useListNavigation(
  getItems: Accessor<readonly Command[]>,
  onEnter: (item: Command, intent: CommandRunContext["intent"]) => void
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

  // IME 変換中の確定キー (Enter) や候補選択キー (↑/↓ や Space) を
  // リストナビゲーションとして拾わないためのガード。
  // `e.isComposing` は IME 入力中の keydown で true になる。
  const isImeComposing = (e: KeyboardEvent) => e.isComposing;

  // 詳細ビューへ切り替わると、この枠は外される。購読を残すと、外れた後の
  // Enter や Cmd+Enter でコマンドが二重に走る。
  onCleanup(
    tinykeys(window, {
      ArrowUp: (e) => {
        if (isImeComposing(e)) return;
        e.preventDefault();
        setSelectedI((i) => i - 1);
      },
      ArrowDown: (e) => {
        if (isImeComposing(e)) return;
        e.preventDefault();
        setSelectedI((i) => i + 1);
      },
      Enter: (e) => {
        if (isImeComposing(e)) return;
        e.preventDefault();
        const item = getItems()[selectedI()];
        if (item !== undefined) onEnter(item, "primary");
      },
      "$mod+Enter": (e) => {
        if (isImeComposing(e)) return;
        e.preventDefault();
        const item = getItems()[selectedI()];
        if (item !== undefined) onEnter(item, "secondary");
      },
      Space: (e) => {
        // 入力欄フォーカス中の Space は通常入力 / IME 変換に透過させる。
        if (isInputFocused() || isImeComposing(e)) return;
        e.preventDefault();
        const idx = selectedI();
        const next = new Set<number>(expandedSet());
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        setExpandedSet(next);
      },
    })
  );

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
  onSelect: (command: Command, context: CommandRunContext) => void;
  /** リスト末端到達時にもっと読み込む通知。 */
  onLoadMore: () => void;
}) {
  // TODO: #2 ↓以下、山口は全く理解してない
  // props.* を直接渡すと Solid lint が "tracked scope の外で reactive を参照" と警告する。
  // hook 側の createMemo / tinykeys ハンドラから呼ばれる時点 (= tracked / event 内) で
  // props を読み直すよう、薄いラッパーで包む。
  const nav = useListNavigation(
    () => props.commands(),
    (item, intent) => run(item, intent)
  );
  let inputRef: HTMLInputElement | undefined;
  const argRefs: (HTMLInputElement | undefined)[] = [];

  const [argValues, setArgValues] = createSignal<Record<string, string>>({});
  const activeArgs = createMemo(
    () => props.commands()[nav.selectedI()]?.args ?? []
  );

  // 選択が別の行へ移ったら、打ち込んだ値は捨てる。前のコマンド宛ての値が
  // 残ったまま実行されるのを防ぐ。
  createEffect(() => {
    nav.selectedI();
    inputValue();
    setArgValues({});
  });

  const run = (command: Command, intent: CommandRunContext["intent"]) => {
    props.onSelect(command, { args: argValues(), intent });
  };

  /** 検索欄と各引数欄を 1 つの輪と見なして、フォーカスを送る。 */
  const moveArgFocus = (step: number) => {
    const fields = [inputRef, ...argRefs.slice(0, activeArgs().length)].filter(
      (el): el is HTMLInputElement => el !== undefined
    );
    if (fields.length <= 1) return;
    const current = fields.indexOf(document.activeElement as HTMLInputElement);
    const base = current < 0 ? 0 : current;
    const next = fields[(base + step + fields.length) % fields.length];
    next.focus();
    next.select();
  };

  onMount(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (activeArgs().length === 0) return;
      if (e.key === "Tab") {
        e.preventDefault();
        moveArgFocus(e.shiftKey ? -1 : 1);
        return;
      }
      // 引数欄から抜けるだけ。ポップアップを閉じる既定の動作には渡さない。
      if (e.key === "Escape" && document.activeElement !== inputRef) {
        e.preventDefault();
        inputRef?.focus();
      }
    };
    window.addEventListener("keydown", onKeydown, true);
    onCleanup(() => window.removeEventListener("keydown", onKeydown, true));
  });

  createEffect(() => {
    const range = takeInputSelectionRange();
    if (!range) return;
    if (!inputRef) return;
    const inputLength = inputRef.value.length;
    const start = Math.max(0, Math.min(range.start, inputLength));
    const end = Math.max(start, Math.min(range.end, inputLength));
    requestAnimationFrame(() => {
      inputRef?.focus();
      inputRef?.setSelectionRange(start, end);
    });
  });

  return (
    <div
      class="App"
      onBlur={() => {
        window.close();
      }}
    >
      <div class="input_wrap">
        <input
          class="input"
          ref={inputRef}
          autofocus
          placeholder="Type to search..."
          value={inputValue()}
          onInput={(e) => {
            setInputValue(e.target.value);
          }}
        />
        <Show when={activeArgs().length > 0}>
          <div class="args">
            <For each={activeArgs()}>
              {(arg, i) => (
                <input
                  class="arg"
                  ref={(el) => (argRefs[i()] = el)}
                  placeholder={arg.placeholder}
                  value={argValues()[arg.name] ?? ""}
                  onInput={(e) =>
                    setArgValues({
                      ...argValues(),
                      [arg.name]: e.target.value,
                    })
                  }
                />
              )}
            </For>
          </div>
        </Show>
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
              onSelect={(selected) => run(selected, "primary")}
            />
          )}
        </InfiniteScroll>
      </ul>
    </div>
  );
}
