import { inputSignal } from "~/util/signals";

import { Command } from "./general";

const [, setInputValue] = inputSignal;

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

export default function getYouTubeCommands(
  pageUrl: URL | undefined
): Command[] {
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
      command: () => runOpenShortInWatchPlayer(videoId),
    },
  ];
}
