import { ChromeStorageRankingRepository, RankingService } from "@core/ranking";
import { createResource } from "solid-js";

const repository = new ChromeStorageRankingRepository();

// popup 起動と同時にランキングのロードを開始する。
// reactive context と非 reactive context の両方から同じインスタンスを参照させたいので、
// `Promise<RankingService>` を1本だけ生成して使い回す。
const servicePromise: Promise<RankingService> =
  RankingService.create(repository);

/** SolidJS のリアクティブ用アクセサ。ロード前は `undefined` を返す。 */
export const [rankingService] = createResource(() => servicePromise);

/** 非リアクティブな async コードからロード完了を待つために用いる。 */
export const whenRankingServiceReady = (): Promise<RankingService> =>
  servicePromise;
