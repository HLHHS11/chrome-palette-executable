export {
  type DuplicateHighlightColor,
  assignDuplicateHighlightColors,
} from "./duplicate-highlight";
export {
  registerKeybindListener,
  type CommandKeybindListenerOptions,
} from "./listener";
export { runRpcCommandInPopup } from "./popup-rpc-runner";
export { stringifyCommandKeybind } from "./display";

export type {
  Command,
  CommandKeybind,
  LegacyCommand,
  PaletteRow,
  RpcCommand,
} from "./types";
