export type Command = {
  title: string;
  subtitle?: string;
  shortcut?: string;
  lastVisitTime?: number;
  keyword?: string;
  icon?: string;
  command?: () => unknown;
  url?: string;
};
