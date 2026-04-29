export type CommandKeybind = {
  key?: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  stopImmediatePropagation?: boolean;
  allowRepeat?: boolean;
  requireTrusted?: boolean;
};

export type Command = {
  title: string;
  subtitle?: string;
  shortcut?: string;
  keybind?: readonly CommandKeybind[];
  lastVisitTime?: number;
  keyword?: string;
  icon?: string;
  handler?: () => unknown;
  url?: string;
};
