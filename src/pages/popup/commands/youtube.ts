import type { Command } from "@core/command";
import { createTabsRpcClient } from "@core/rpc";
import type { routes } from "@pages/content/routes";

import { inputSignal } from "~/util/signals";

import { buildMarkdownLinkSnippet } from "./utils-copy-tab-link";

const [, setInputValue] = inputSignal;
const callContentRpc = createTabsRpcClient<typeof routes>();

async function runOpenShortInWatchPlayer(videoId: string): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!tab.id) {
      setInputValue("エラーが発生しました。");
      return;
    }

    await chrome.tabs.update(tab.id, {
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
    window.close();
  } catch (e) {
    console.error(e);
    setInputValue("エラーが発生しました。");
  }
}

async function runCopyTimestampedMarkdownLink(videoId: string): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const res = await callContentRpc({ name: "youtube.getCurrentTime" });
    if (!res.ok) throw new Error(res.error);
    if (!("data" in res)) throw new Error(res.info);
    const totalSeconds = res.data.currentTimeSeconds;

    // 5694 秒 → "1:34:54"、2960 秒 → "49:20" のように、1 時間未満では時の桁を省く
    const timestampLabel = (() => {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
        : `${minutes}:${seconds}`;
    })();
    // タブ名は通知があると "(3) 動画タイトル - YouTube" の形になる
    const videoTitle = (tab.title ?? "")
      .replace(/^\(\d+\) /, "")
      .replace(/ - YouTube$/, "");
    const url = `https://youtu.be/${videoId}?t=${totalSeconds}s`;

    await navigator.clipboard.writeText(
      buildMarkdownLinkSnippet(`${videoTitle} (${timestampLabel})`, url)
    );
    window.close();
  } catch (e) {
    console.error(e);
    setInputValue(`エラーが発生しました。詳細: ${e}`);
  }
}

export default function getYouTubeCommands(
  pageUrl: URL | undefined
): Command[] {
  const isYouTubeWatchPage =
    pageUrl?.hostname === "www.youtube.com" && pageUrl.pathname === "/watch";
  const watchVideoId = pageUrl?.searchParams.get("v");
  if (isYouTubeWatchPage && watchVideoId) {
    return [
      {
        title: "YouTube: 再生位置付きのリンクをマークダウンでコピー",
        subtitle: "YouTube: Copy Timestamped Link as Markdown",
        handler: () => runCopyTimestampedMarkdownLink(watchVideoId),
      },
    ];
  }

  const isYouTubeShortsPage =
    pageUrl?.hostname === "www.youtube.com" &&
    pageUrl.pathname.startsWith("/shorts/");
  if (!isYouTubeShortsPage) return [];

  const videoId = pageUrl.pathname.replace("/shorts/", "").split("/")[0];
  if (!videoId) return [];

  return [
    {
      title: "YouTube: ショート動画を通常プレイヤーで開く",
      subtitle: "YouTube: Open shorts in watch player",
      handler: () => runOpenShortInWatchPlayer(videoId),
    },
  ];
}
