import { defineCrossRuntimeMessage } from "@core/cross-runtime-message";

/**
 * 「hotkey 経由で tab-search を開きたい」という意図を表す DTO。
 * `key` は将来複数 intent を discriminated union で扱えるようにするための識別子。
 * payload は今のところ空。
 */
export type HotkeyLaunchIntent = {
  key: "hotkey-launch-intent";
  payload: Record<string, never>;
};

export const hotkeyLaunchIntentMessage =
  defineCrossRuntimeMessage<HotkeyLaunchIntent>(
    "tab-search:hotkey-launch-intent"
  );
