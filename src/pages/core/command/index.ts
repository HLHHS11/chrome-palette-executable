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
  CommandArg,
  CommandKeybind,
  CommandRunContext,
  LegacyCommand,
  PaletteRow,
  RpcCommand,
} from "./types";
