import { routes } from "../../content/routes";
import type { RpcHandler } from "../../lib/rpc/types";
import type { CommandKeybind, RpcCommand } from "./types";

export type CommandKeybindListenerOptions = {
  getCommands: () => readonly RpcCommand[];
  // REVIEW: #1 わざわざここのオプションとして渡す必要あるだろうか！？
  target?: Window | Document;
  // REVIEW: #1 わざわざここのオプションとして渡す必要あるだろうか！？
  capture?: boolean;
};

function matchesCommandKeybind(
  event: KeyboardEvent,
  keybind: CommandKeybind
): boolean {
  if (keybind.requireTrusted !== false && !event.isTrusted) return false;
  if (!keybind.allowRepeat && event.repeat) return false;

  const isMetaMatched =
    keybind.metaKey === undefined || keybind.metaKey === event.metaKey;
  if (!isMetaMatched) return false;
  const isCtrlMatched =
    keybind.ctrlKey === undefined || keybind.ctrlKey === event.ctrlKey;
  if (!isCtrlMatched) return false;
  const isAltMatched =
    keybind.altKey === undefined || keybind.altKey === event.altKey;
  if (!isAltMatched) return false;
  const isShiftMatched =
    keybind.shiftKey === undefined || keybind.shiftKey === event.shiftKey;
  if (!isShiftMatched) return false;

  const isKeyMatched =
    keybind.key === undefined ||
    keybind.key.toLowerCase() === event.key.toLowerCase();
  if (!isKeyMatched) return false;
  const isCodeMatched =
    keybind.code === undefined || keybind.code === event.code;
  if (!isCodeMatched) return false;

  return true;
}

export function registerKeybindListener(
  options: CommandKeybindListenerOptions
): () => void {
  const target = options.target ?? window;
  const capture = options.capture ?? true;

  const onKeydown: EventListener = (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const commands = options.getCommands();
    for (const command of commands) {
      if (!command.keybind?.length) continue;
      for (const keybind of command.keybind) {
        if (!matchesCommandKeybind(event, keybind)) continue;

        if (keybind.preventDefault) event.preventDefault();
        if (keybind.stopImmediatePropagation) {
          event.stopImmediatePropagation();
        } else if (keybind.stopPropagation) {
          event.stopPropagation();
        }

        // TODO: #1 REFACTOR さすがに中読みにくすぎやろ。型の関係で変なことしすぎ。asも多いし
        // TODO: #1 REVERT ログを差し込みすぎ
        const run = async () => {
          const message = command.message as
            | ({ name: string } & Record<string, unknown>)
            | undefined;
          if (!message?.name) {
            console.error("[chrome-palette] Invalid RPC message.");
            return;
          }
          const route = routes.find(
            (candidate) => candidate.name === message.name
          );
          if (!route) {
            console.error(`[chrome-palette] Unknown route: ${message.name}`);
            return;
          }
          const { name: _, ...params } = message;
          const handler = route.handler as RpcHandler;
          const res = await Promise.resolve(
            handler(params as never, {
              sender: { id: chrome.runtime.id } as chrome.runtime.MessageSender,
            })
          );
          if (res && typeof res === "object" && "ok" in res && !res.ok) {
            const error =
              "error" in res && typeof res.error === "string"
                ? res.error
                : "Unknown RPC error";
            console.error(`[chrome-palette] ${error}`);
          }
        };
        void Promise.resolve(run()).catch((e: unknown) => {
          console.error(`Command keybind execution failed: ${e}`);
        });
        return;
      }
    }
  };

  target.addEventListener("keydown", onKeydown, capture);
  // TODO: #1 クリーンアップ関数を返すのは理解できるが、実際の所必要なのか！？
  // あ、たとえば、毎回これロードしていったら、どんどんイベントリスナーが肥大化していくみたいな？？
  // でもそうだとしても、CQS的には気持ちよくない。せめて、関数の名前、シグネチャとしてわかりやすいものを使いたい
  return () => {
    target.removeEventListener("keydown", onKeydown, capture);
  };
}
