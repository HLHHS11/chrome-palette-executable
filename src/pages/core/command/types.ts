import type { HighlightSpec } from "@core/search";

import type { DuplicateHighlightColor } from "./duplicate-highlight";

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

/**
 * コマンドが候補に挙がった時点で、その場に打ち込める小さな入力欄。
 *
 * 「5 分後のタイマー」のように、値がひとつ決まれば実行できるコマンドのための
 * 仕組み。専用の画面を開かずに済ませられる。
 */
export type CommandArg = {
  /** 実行時に値を引くための名前。 */
  name: string;
  placeholder: string;
};

/** コマンドを実行するときに、パレットから渡される状況。 */
export type CommandRunContext = {
  /** `CommandArg.name` をキーにした入力値。未入力は空文字。 */
  args: Record<string, string>;
  /**
   * どのキーで実行されたか。Enter が `primary`、Cmd+Enter が `secondary`。
   * 2 つの意味をどう割り当てるかはコマンド側が決める。
   */
  intent: "primary" | "secondary";
};

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
  /**
   * その行が指すタブに貼られたメモ本文。
   * 表示されるだけでなく、パレット検索のマッチ対象にもなる。
   */
  memo?: string;
  /**
   * 同一ページ (完全一致 URL) が複数開かれている行に付ける識別色。
   * 同じ色 = 同じページが別タブでも開かれている、というマーク。
   * 重複していない行では undefined。
   */
  duplicateHighlightColor?: DuplicateHighlightColor;
  /** 入力欄の右に並べる引数。選択中の行のものだけが表示される。 */
  args?: readonly CommandArg[];
};

export type LegacyCommand = CommandBase & {
  handler?: (context: CommandRunContext) => unknown;
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

/**
 * Palette の表示パイプに乗せるために Command 構造を借りている行。
 * 「ユーザーが能動的に呼び出すコマンド」ではない (loading placeholder / 検索結果行など)。
 * TODO: #2 FIX で Surface 抽象が入ったら消したい。
 */
export type PaletteRow = Command;
