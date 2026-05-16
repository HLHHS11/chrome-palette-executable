import type { HighlightSpec } from "@core/search";

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

type NonEmptyArray<T> = readonly [T, ...T[]];

type CommandBase = {
  title: string;
  subtitle?: string;
  shortcut?: string;
  keybind?: NonEmptyArray<CommandKeybind>;
  lastVisitTime?: number;
  keyword?: string;
  icon?: string;
  url?: string;
  /**
   * 検索結果として表示する際の、各フィールドのマッチ位置情報。
   *
   * このプロパティが付いている Command を Entry が描画するとき、
   * Entry はこのレンジ情報のみを根拠にハイライトを描画する
   * （fuzzysort などの検索エンジンに直接は依存しない）。
   */
  highlights?: HighlightSpec;
};

export type LegacyCommand = CommandBase & {
  handler?: () => unknown;
};

//
/**
 * TODO: #1 REFACTOR core/rpc/types.ts との兼ね合いに注意。RpcRequestとか、core/rpc側で定義したほうがいいかも。
 * けど、RpcCommand自体は、レガシーなやつと分けるって意味合いの、RPC-Based Commandであるからそこんとこ混同しないようには注意必要
 * てかこれのジェネリクスってホンマに必要か？？
 */
export type RpcCommand<RpcRequest extends object = { name: string }> =
  CommandBase & {
    message: RpcRequest;
  };

export type Command = LegacyCommand | RpcCommand;
