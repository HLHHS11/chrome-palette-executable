/**
 * 同じページ (完全一致 URL) が複数開かれていることを、パレット行の背景に同色マークを
 * 敷いて見分けさせる仕組み。Command 定義に載る表示情報の一部として core/command が持つ。
 * 縦タブ表示・タブ横断検索など、複数の行を並べる側がこの色割り当てを利用する。
 *
 * 色数は 10 色。CSS 変数 `--duplicate-highlight-{0..9}` と 1:1 で対応する。
 */
export type DuplicateHighlightColor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const COLOR_COUNT = 10;

/**
 * URL 列を先頭から走査し、2 回以上現れる URL にだけ色番号を割り当てて Map で返す。
 *
 * - 1 回しか現れない URL は「重複なし」なので Map に含めない。
 * - 色番号は重複 URL の初出順に 0,1,2,… と振り、10 色を超えたら巡回させる。
 * - 空文字の URL は判定対象外 (about:blank 相当のタブ同士を重複扱いしない)。
 */
export function assignDuplicateHighlightColors(
  urls: Iterable<string>
): Map<string, DuplicateHighlightColor> {
  const orderedUrls = [...urls];

  const countByUrl = new Map<string, number>();
  for (const url of orderedUrls) {
    if (!url) continue;
    countByUrl.set(url, (countByUrl.get(url) ?? 0) + 1);
  }

  const colorByUrl = new Map<string, DuplicateHighlightColor>();
  let nextColorIndex = 0;
  for (const url of orderedUrls) {
    if (!url || (countByUrl.get(url) ?? 0) < 2 || colorByUrl.has(url)) continue;
    colorByUrl.set(
      url,
      (nextColorIndex % COLOR_COUNT) as DuplicateHighlightColor
    );
    nextColorIndex += 1;
  }
  return colorByUrl;
}
