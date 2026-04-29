import "./App.scss";

import type { routes } from "@pages/content/routes";
import {
  type Command,
  type RpcCommand,
  runRpcCommandInPopup,
} from "@pages/core/command";
import { createTabsRpcClient } from "@pages/lib/rpc/client";
import type { ExtractRpcRequest } from "@pages/lib/rpc/types";
import fuzzysort from "fuzzysort";
import InfiniteScroll from "solid-infinite-scroll";
import {
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { tinykeys } from "tinykeys";

import { listAllCommands } from "../command";
import Entry from "./Entry";
import Shortcut from "./Shortcut";
import { sortByUsed, storeLastUsed } from "./util/last-used";
import { createStoredSignal, inputSignal, parsedInput } from "./util/signals";

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
  const commands = listAllCommands(pageUrl);
  sortByUsed(commands);
  return commands;
});

const commandsLimit = 75;

const [scrollIndex, setScrollIndex] = createSignal(commandsLimit);

const matches = createMemo(() => {
  return fuzzysort.go(parsedInput().query, allCommands(), {
    threshold: -10000, // don't return bad results
    limit: scrollIndex(), // Don't return more results than this (lower is faster)
    all: true, // If true, returns all results for an empty search
    keys: ["title", "subtitle", "url"], // For when targets are objects (see its example usage)
    // keys: null, // For when targets are objects (see its example usage)
    // scoreFn: null, // For use with `keys` (see its example usage)
  });
});

const filteredCommands = createMemo(() => {
  /* The filtered commands are contained in matches and are stable references.
   * This means they don't change while you type, and this allows the
   * <Each /> component (or <InfiniteScroll />) to use them as keys,
   * and not re-create dom elements.
   */
  return matches().map((match) => match.obj);
});

const [selectedI_internal, setSelectedI] = createSignal(0);

const selectedI = createMemo(() => {
  const n = filteredCommands().length;
  return ((selectedI_internal() % n) + n) % n;
});

createEffect(() => {
  inputValue();
  setSelectedI(0);
});

// TODO: #1 REFACTOR そもそもApp.tsxにおいておくべきじゃない
export const runCommand = async (command: Command) => {
  storeLastUsed(command);
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
    const selected = filteredCommands()[selectedI()];
    runCommand(selected);
  },
});

const PinWarning = () => {
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
};
const App = () => {
  createEffect(() => {
    inputValue();
    setScrollIndex(commandsLimit);
  });
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
              setSelectedI(0);
            }}
          />
          <Shortcut
            onClick={() =>
              chrome.tabs.create({ url: "chrome://extensions/shortcuts" })
            }
            keys={shortcut()}
          />
        </div>
        <ul class="list">
          <InfiniteScroll
            loadingMessage={<></>}
            each={filteredCommands()}
            hasMore={true}
            next={() => setScrollIndex(scrollIndex() * 2)}
          >
            {(command, i) => {
              const isSelected = createMemo(() => i() === selectedI());
              return (
                <Entry
                  isSelected={isSelected()}
                  keyResults={matches()[i()]}
                  command={command}
                />
              );
            }}
          </InfiniteScroll>
        </ul>
      </div>
      <PinWarning />
    </>
  );
};

export default App;
