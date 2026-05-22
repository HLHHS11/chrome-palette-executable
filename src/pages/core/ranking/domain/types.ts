/** コマンドを一意に識別するキー。当面は command.title を流用する。 */
export type CommandId = string;

/**
 * 正規化済みクエリ。trim + toLowerCase 後の文字列。
 * 空文字列 "" は「クエリに依存しないグローバル MRU」を表現する特殊なキー。
 */
export type NormalizedQuery = string;

/**
 * ランキング集計の1エントリ。`(commandId, query)` のペアでユニーク。
 */
export type RankingEntry = {
  commandId: CommandId;
  query: NormalizedQuery;
  hitCount: number;
  /** epoch ms */
  lastUsedAt: number;
};
