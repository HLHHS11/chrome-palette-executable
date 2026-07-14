// render inside top level Solid component
import "./Entry.scss";

import type { Command } from "@core/command";
import type { HighlightRanges } from "@core/search";
import { JSX, Show, createEffect } from "solid-js";
import twas from "twas";

import Keyword from "./Keyword";
import Shortcut from "./Shortcut";

/**
 * @deprecated Entry の表示責務に紐づいた場所にあるため、新規コードでは使わない。
 * 新しい popup use case では `popup/util/favicon` を参照する。
 */
export function faviconURL(u?: string) {
  if (!u) return u;
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", u);
  url.searchParams.set("size", "32");
  return url.toString();
}

/**
 * `text` の中で `ranges` が指す箇所を `<b>` で囲んだ JSX を返す。
 *
 * - レンジは半開区間 `[start, endExclusive)`。
 * - 範囲外 / 不正なレンジは無視。
 * - `ranges` が空または undefined のときは生のテキストを返す。
 *
 * Entry の各テキスト行 (title / subtitle / url / snippet) の描画専用の補助関数。
 * 検索エンジン (fuzzysort / tab-content-searcher 等) が出力する HighlightRanges に
 * 対する純粋な見た目の責務を Entry が持っているため、ここに同居させる。
 */
function renderWithHighlights(
  text: string,
  ranges: HighlightRanges | undefined
): JSX.Element {
  if (!ranges || ranges.length === 0) return text;

  const sorted = [...ranges]
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return text;

  const out: JSX.Element[] = [];
  let cursor = 0;
  for (const [start, end] of sorted) {
    const s = Math.max(start, cursor);
    const e = Math.min(end, text.length);
    if (s >= e) continue;
    if (s > cursor) out.push(text.slice(cursor, s));
    out.push(<b>{text.slice(s, e)}</b>);
    cursor = e;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/**
 * twas の相対時刻表示を流用しつつ、単数を "a/an" ではなく "1" で見せる
 * ("an hour ago" → "1 hour ago")。数字に揃えた方がどちらが新しいか比較しやすいため。
 */
function timeAgo(ms: number): string {
  return twas(ms).replace(/^an? /, "1 ");
}

export default function Entry(props: {
  isSelected: boolean;
  isExpanded: boolean;
  command: Command;
  /** クリック時のアクション。runCommand 等を親 (PaletteShell) から注入する。 */
  onSelect: (command: Command) => void;
}) {
  const url = () => ("url" in props.command ? props.command.url || "" : "");
  const snippet = () => props.command.highlights?.snippet;

  // 相対時刻 (lastVisitTime) をどの行の右端に添えるか。
  // - URL を持つ行 (history / bookmarks) は URL 行に添える。
  // - URL は無いが subtitle を持つ行 (タブ横断検索の host+path) は subtitle 行に添える。
  // - URL も subtitle も無い行 (ブックマークフォルダ) は独立した行に出す。
  const timeOnSubtitle = () =>
    !!props.command.lastVisitTime && !!props.command.subtitle && !url();
  const showUrlLine = () =>
    !!url() || (!!props.command.lastVisitTime && !props.command.subtitle);

  return (
    <li
      class="Entry"
      classList={{
        selected: props.isSelected,
        [`duplicate_${props.command.duplicateHighlightColor}`]:
          props.command.duplicateHighlightColor !== undefined,
      }}
      onClick={() => {
        props.onSelect(props.command);
      }}
      ref={(el) => {
        createEffect(() => {
          if (props.isSelected) {
            el.scrollIntoView({ behavior: "auto", block: "nearest" });
          }
        });
      }}
    >
      <Show when={props.command.icon || faviconURL(props.command.url)}>
        {(icon) => (
          <img
            classList={{
              img: true,
              img_big: !!(props.command.subtitle || url() || snippet()),
            }}
            src={icon()}
            alt=""
            loading="lazy"
          />
        )}
      </Show>

      <div class="text">
        <div class="title">
          {renderWithHighlights(
            props.command.title || "",
            props.command.highlights?.title
          )}
        </div>
        <Show when={props.command.subtitle}>
          <div class="subtitle">
            {renderWithHighlights(
              props.command.subtitle || "",
              props.command.highlights?.subtitle
            )}
            <Show when={timeOnSubtitle() && props.command.lastVisitTime}>
              {(time) => <span class="time_ago">{timeAgo(time())}</span>}
            </Show>
          </div>
        </Show>
        <Show when={showUrlLine()}>
          <div class="subtitle">
            {renderWithHighlights(url(), props.command.highlights?.url)}
            <Show when={props.command.lastVisitTime}>
              {(time) => <span class="time_ago">{timeAgo(time())}</span>}
            </Show>
          </div>
        </Show>
        <Show when={snippet()}>
          {(s) => (
            <div
              class="snippet"
              classList={{ snippet_expanded: props.isExpanded }}
            >
              {renderWithHighlights(s().text, s().ranges)}
            </div>
          )}
        </Show>
      </div>
      <Shortcut keys={props.command.shortcut} />
      <Keyword keyword={props.command.keyword} />
    </li>
  );
}
