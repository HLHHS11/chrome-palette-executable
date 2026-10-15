import type { RpcResponse } from "@core/rpc";

type GetYouTubeCurrentTimeResponseBody = {
  /** 再生位置 (秒, 小数切り捨て) */
  currentTimeSeconds: number;
};

export function getYouTubeCurrentTime(): RpcResponse<GetYouTubeCurrentTimeResponseBody> {
  const video = document.querySelector<HTMLVideoElement>("#movie_player video");
  if (!video) return { ok: false, error: "動画プレイヤーが見つかりません。" };
  return {
    ok: true,
    data: { currentTimeSeconds: Math.floor(video.currentTime) },
  };
}
