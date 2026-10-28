// YouTube には、`&t=129s` のような時刻指定リンクを開いても、一瞬指定位置に
// シークしたあと視聴履歴の再開位置など無関係な位置へ飛ばされるバグがある。
// 再生開始直後の短い間だけ再生位置を監視し、指定位置から外れたら指定位置に戻す。

// 再生開始からこの時間を過ぎたら、以降の位置変化はユーザー操作によるものとみなして監視をやめる
const GUARD_DURATION_AFTER_PLAYING_MS = 5_000;
// 再生による自然な進みに加えて許容するずれ (秒)
const TOLERANCE_SECONDS = 2;

/** `t` パラメータ ("129s", "129", "2m9s", "1h2m9s") を秒数に変換する */
function parseStartTimeSeconds(t: string): number | null {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t);
  if (!match || t === "") return null;
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

export function initYouTubeStartTimeGuard(): void {
  if (location.hostname !== "www.youtube.com") return;

  let currentGuard: AbortController | null = null;

  const startGuard = () => {
    currentGuard?.abort();
    currentGuard = null;

    const url = new URL(location.href);
    if (url.pathname !== "/watch") return;
    const t = url.searchParams.get("t");
    const targetSeconds = t === null ? null : parseStartTimeSeconds(t);
    if (targetSeconds === null) return;

    const video = document.querySelector<HTMLVideoElement>(
      "#movie_player video"
    );
    if (!video) return;

    const guard = new AbortController();
    currentGuard = guard;
    const { signal } = guard;
    let playingStartedAt: number | null = null;

    const isAdShowing = () =>
      document.querySelector("#movie_player.ad-showing") !== null;

    const checkPosition = () => {
      // 広告再生中は video 要素が広告を再生しているので、その位置は本編と無関係
      if (isAdShowing()) return;

      const elapsedSeconds =
        playingStartedAt === null ? 0 : (Date.now() - playingStartedAt) / 1000;
      if (elapsedSeconds * 1000 > GUARD_DURATION_AFTER_PLAYING_MS) {
        guard.abort();
        return;
      }

      const maxExpectedSeconds =
        targetSeconds + elapsedSeconds * video.playbackRate + TOLERANCE_SECONDS;
      const isDisplaced =
        video.currentTime < targetSeconds - TOLERANCE_SECONDS ||
        video.currentTime > maxExpectedSeconds;
      if (!isDisplaced) return;

      console.log(
        `[chrome-palette] YouTube jumped to ${video.currentTime}s; seeking back to ${targetSeconds}s`
      );
      video.currentTime = targetSeconds;
    };

    video.addEventListener(
      "playing",
      () => {
        if (playingStartedAt === null && !isAdShowing()) {
          playingStartedAt = Date.now();
        }
        checkPosition();
      },
      { signal }
    );
    video.addEventListener("seeked", checkPosition, { signal });
    video.addEventListener("timeupdate", checkPosition, { signal });

    // 監視中にユーザーが自分でシークした場合に、指定位置へ引き戻さないようにする
    const stopOnUserInput = (event: Event) => {
      if (event.isTrusted) guard.abort();
    };
    document.addEventListener("pointerdown", stopOnUserInput, {
      capture: true,
      signal,
    });
    document.addEventListener("keydown", stopOnUserInput, {
      capture: true,
      signal,
    });

    checkPosition();
  };

  // YouTube は SPA なので、動画間の遷移はページロードではなくこのイベントで検知する
  document.addEventListener("yt-navigate-finish", startGuard);
  startGuard();
}
