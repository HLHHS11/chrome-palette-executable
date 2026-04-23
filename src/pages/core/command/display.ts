import { CommandKeybind } from "./types";

export function stringifyCommandKeybind(keybind: CommandKeybind): string {
  const tokens: string[] = [];
  if (keybind.ctrlKey) tokens.push("Ctrl");
  if (keybind.metaKey) tokens.push("Cmd");
  if (keybind.altKey) tokens.push("Alt");
  if (keybind.shiftKey) tokens.push("Shift");

  if (keybind.key) {
    tokens.push(
      keybind.key.length === 1 ? keybind.key.toUpperCase() : keybind.key
    );
  } else if (keybind.code) {
    tokens.push(keybind.code);
  }
  return tokens.join("+");
}
