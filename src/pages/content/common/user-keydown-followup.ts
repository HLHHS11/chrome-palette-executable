/**
 * ヘッドレス — 次のキー入力まで待ち、それを起点に後続処理を続ける。
 * オーバーレイ付きの簡易確認は `user-keydown-overlay` の {@link startUserKeydownOverlay}。
 *
 * 反応するのはブラウザが発行した実入力のみ（`KeyboardEvent.isTrusted === true`）。
 * 合成の `dispatchEvent` や拡張からの疑似キーは無視する。厳格なサイトがクリック等で
 * ユーザージェスチャを要求する場合に効くが、`isTrusted` を問わないページでも
 * 「もう一度キーを押して確定」といった軽い確認フロー用に使える。
 *
 * リスナは capture かつ一度きり。実行・キャンセルどちらでも `preventDefault` と
 * `stopImmediatePropagation` を行い、ホストページへ余計なキーを渡さない。
 */
export type UserKeydownFollowupOptions = {
  /**
   * true のときだけ `execute` を呼ぶ。省略時は Enter / Space のみ true。
   */
  shouldExecute?: (e: KeyboardEvent) => boolean;
  /**
   * キー入力を取り込んだ直後（リスナ解除後）、`execute` より前に必ず一度呼ぶ。
   * モーダル UI の teardown などに使う。
   */
  onConsumed?: () => void;
  execute: (e: KeyboardEvent) => void;
};

function defaultShouldExecute(e: KeyboardEvent): boolean {
  if (e.key === "Enter" || e.code === "Enter") return true;
  if (e.code === "Space") return true;
  return e.key === " " || e.key === "Spacebar";
}

/**
 * 次の（実際の）`keydown` まで待ち、条件を満たせば `execute` を呼ぶ。
 * 返り値でリスナを外す（待機のキャンセル用）。
 */
export function attachUserKeydownFollowup(
  options: UserKeydownFollowupOptions
): () => void {
  const shouldExecute = options.shouldExecute ?? defaultShouldExecute;

  const detach = () => {
    document.removeEventListener("keydown", onKeydown, true);
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (!e.isTrusted) return;

    const run = shouldExecute(e);
    e.preventDefault();
    e.stopImmediatePropagation();

    detach();

    options.onConsumed?.();

    if (!run) return;
    options.execute(e);
  };

  document.addEventListener("keydown", onKeydown, true);
  return detach;
}
