import {
  type Command,
  type RpcCommand,
  runRpcCommandInPopup,
} from "@core/command";
import { PaletteSearcher } from "@core/palette-search";
import { type ExtractRpcRequest, createTabsRpcClient } from "@core/rpc";
import type { routes } from "@pages/content/routes";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

import { listAllCommands } from "../command";
import PaletteShell from "./PaletteShell";
import {
  TAB_SEARCH_KEYWORD,
  TabSearch,
  type TabSnapshot,
  collectTabSnapshots,
} from "./commands/tab-search";
import {
  VERTICAL_TABS_KEYWORD,
  type VerticalTabItem,
  VerticalTabsView,
  collectVerticalTabs,
  verticalTabsCloseIntentMessage,
} from "./commands/vertical-tabs";
import { rankingService } from "./util/ranking";
import {
  createLazyResource,
  createStoredSignal,
  inputSignal,
  parsedInput,
} from "./util/signals";

const [shortcut, setShortcut] = createStoredSignal("_execute_action", "?");

chrome.commands.getAll().then((commands) => {
  const mainCommand = commands.find(({ name }) => name === "_execute_action");
  if (mainCommand?.shortcut) setShortcut(mainCommand.shortcut);
  else setShortcut("?");
});

const [inputValue, setInputValue] = inputSignal;
// TODO: #1 REFACTOR runRpcCommandInPopupの設計上の都合もあって、クライアント作成やExtractが必要になるのは気持ち悪い。
// 修正したいところ。
const callTabsRpc = createTabsRpcClient<typeof routes>();
type ContentRpcMessage = ExtractRpcRequest<(typeof routes)[number]>;

const tabSnapshots = createLazyResource<TabSnapshot[]>([], () =>
  collectTabSnapshots()
);
const tabSearch = new TabSearch({ corpus: tabSnapshots });
tabSearch.restoreSession();

const [activeTabPageUrl] = createResource(
  async (): Promise<URL | undefined> => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });

    if (!tab.url) return undefined;
    return new URL(tab.url);
  }
);

const allCommands = createMemo(() => {
  const pageUrl = activeTabPageUrl();
  return listAllCommands(pageUrl);
});

const commandsLimit = 75;

const [scrollIndex, setScrollIndex] = createSignal(commandsLimit);
const verticalTabsSearchParams = new URLSearchParams(location.search);
const verticalTabsRequestId = verticalTabsSearchParams.get("requestId");
const verticalTabsWindowId = (() => {
  const raw = verticalTabsSearchParams.get("windowId");
  if (raw === null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
})();
const isEphemeralVerticalTabsActive =
  verticalTabsSearchParams.get("surface") === "vertical-tabs";
const META_TAP_MAX_MS = 300;
const META_DOUBLE_TAP_WINDOW_MS = 450;
const isVerticalTabsMode = createMemo(
  () =>
    isEphemeralVerticalTabsActive ||
    parsedInput().keyword === VERTICAL_TABS_KEYWORD
);
const [verticalTabs] = createResource(isVerticalTabsMode, (isActive) =>
  isActive
    ? collectVerticalTabs({ windowId: verticalTabsWindowId })
    : Promise.resolve([])
);

// TODO: #2 FIX
// 本来 "全タブ検索の結果" は Command ではなく、専用の結果型を持って独自の描画パスを
// 通って表示されるべきもの。今は popup が Command[] しか描画できないため、tab-search が
// 結果を Command の皮に詰めて返している。それに合わせてここでも「`s>` モードなら
// tab-search を直接呼ぶ」という keyword ベタ書きの dispatch を書いている。
//
// Palette Shell + Surface 抽象 (Shell に "現在アクティブな Surface" を注入し、Surface が
// 自前の描画 / 状態 / キーバインドを持つ) を入れると、この dispatch も Command 偽装も
// 不要になり、Surface 追加 (ブックマーク横断 / 設定パネル / LLM チャット等) も並列に
// 扱えるようになる。次回着手予定。
const filteredCommands = createMemo<Command[]>(() => {
  // TODO: #2 FIX たぶん、 `TAB_SEARCH_KEYWORD` のチェックも
  // ハードコーディングに頼らずやる方法があると思うんだが…
  if (parsedInput().keyword === TAB_SEARCH_KEYWORD) {
    return tabSearch.search(parsedInput().query);
  }
  const searcher = new PaletteSearcher({
    rankingService: rankingService(),
    limit: scrollIndex(),
  });
  const hits = searcher.run(parsedInput().query, allCommands());
  return hits.map((h) => h.item);
});

const runCommand = async (command: Command) => {
  try {
    const service = rankingService();
    if (service) {
      await service.record(command.title, parsedInput().query);
    }
  } catch (e) {
    console.error("Failed to record ranking. Details:", e);
  }
  if ("message" in command) {
    await runRpcCommandInPopup(command as RpcCommand<ContentRpcMessage>, {
      callTabsRpc,
      setInputValue,
    });
    return;
  }
  if (command.url) chrome.tabs.create({ url: command.url });
  command.handler?.();
};

const App = () => {
  onMount(() => {
    const onStorageChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== "session") return;
      if (!(verticalTabsCloseIntentMessage.key in changes)) return;
      const closeIntent = changes[verticalTabsCloseIntentMessage.key].newValue;
      if (!isEphemeralVerticalTabsActive) return;
      if (
        verticalTabsRequestId !== null &&
        closeIntent?.requestId !== verticalTabsRequestId
      ) {
        return;
      }
      window.close();
    };
    chrome.storage.onChanged.addListener(onStorageChanged);

    let isMetaTapCandidate = false;
    let metaTapStartedAt = 0;
    let lastMetaTapAt = 0;
    // 擬似縦タブは左 Cmd のダブルタップで開く/閉じるため、ここも左 Cmd 限定に揃える。
    // 右 Cmd の keydown/keyup は下の `!isMetaKeyEvent` 分岐でリセット扱いになる。
    const isMetaKeyEvent = (e: KeyboardEvent): boolean => e.code === "MetaLeft";

    const onKeyup = (e: KeyboardEvent) => {
      const now = Date.now();
      const tapDurationMs = now - metaTapStartedAt;
      const isShortMetaTap =
        isMetaTapCandidate && tapDurationMs <= META_TAP_MAX_MS;
      if (!isMetaKeyEvent(e)) return;
      if (!isEphemeralVerticalTabsActive) return;
      if (!isShortMetaTap) {
        isMetaTapCandidate = false;
        lastMetaTapAt = 0;
        return;
      }
      isMetaTapCandidate = false;
      if (
        lastMetaTapAt !== 0 &&
        now - lastMetaTapAt <= META_DOUBLE_TAP_WINDOW_MS
      ) {
        window.close();
        return;
      }
      lastMetaTapAt = now;
    };
    const onKeydown = (e: KeyboardEvent) => {
      if (!isEphemeralVerticalTabsActive) return;
      if (e.repeat) return;
      if (!isMetaKeyEvent(e)) {
        isMetaTapCandidate = false;
        lastMetaTapAt = 0;
        return;
      }
      isMetaTapCandidate = true;
      metaTapStartedAt = Date.now();
    };
    window.addEventListener("keydown", onKeydown, true);
    window.addEventListener("keyup", onKeyup, true);

    onCleanup(() => {
      chrome.storage.onChanged.removeListener(onStorageChanged);
      window.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("keyup", onKeyup, true);
    });
  });

  // 入力が変化したら次回表示のページサイズを初期値に戻す。
  // scrollIndex は「fuzzysort が返す件数の上限」を兼ねているので、
  // クエリが変わった瞬間に下位ページの状態を持ち越さないようリセットする。
  createEffect(() => {
    inputValue();
    setScrollIndex(commandsLimit);
  });

  const selectVerticalTab = async (item: VerticalTabItem) => {
    await chrome.tabs.update(item.tabId, { active: true });
    await chrome.windows.update(item.windowId, { focused: true });
    window.close();
  };

  return (
    <>
      {isVerticalTabsMode() ? (
        <VerticalTabsView
          items={() => verticalTabs() ?? []}
          onSelect={selectVerticalTab}
        />
      ) : (
        <PaletteShell
          shortcut={shortcut}
          commands={filteredCommands}
          onSelect={runCommand}
          onLoadMore={() => setScrollIndex(scrollIndex() * 2)}
        />
      )}
    </>
  );
};

export default App;
