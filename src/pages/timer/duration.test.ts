import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatRemaining,
  formatRemainingRough,
  toDurationMs,
} from "./duration";

describe("toDurationMs", () => {
  it("空欄を 0 として扱い、合計を ms で返す", () => {
    expect(toDurationMs({ hours: "", minutes: "5", seconds: "" })).toBe(
      300_000
    );
    expect(toDurationMs({ hours: "1", minutes: "0", seconds: "30" })).toBe(
      3_630_000
    );
  });

  it("60 を超える分や秒はそのまま足し合わせる", () => {
    expect(toDurationMs({ hours: "", minutes: "90", seconds: "" })).toBe(
      5_400_000
    );
  });

  it("合計が 0 の入力は作らせない", () => {
    expect(toDurationMs({ hours: "", minutes: "", seconds: "" })).toBeNull();
    expect(toDurationMs({ hours: "0", minutes: "0", seconds: "0" })).toBeNull();
  });

  it("数字以外が混ざっていたら作らせない", () => {
    expect(toDurationMs({ hours: "", minutes: "5m", seconds: "" })).toBeNull();
    expect(toDurationMs({ hours: "-1", minutes: "", seconds: "" })).toBeNull();
  });
});

describe("formatRemaining", () => {
  it("1 時間未満は分:秒で出す", () => {
    expect(formatRemaining(754_000)).toBe("12:34");
  });

  it("1 時間以上は時:分:秒で出す", () => {
    expect(formatRemaining(3_723_000)).toBe("1:02:03");
  });

  it("過ぎていたら 0:00 に丸める", () => {
    expect(formatRemaining(-5_000)).toBe("0:00");
  });
});

describe("formatRemainingRough", () => {
  it("分単位に切り上げる", () => {
    expect(formatRemainingRough(61_000)).toBe("約2分後");
    expect(formatRemainingRough(3_540_000)).toBe("約59分後");
    expect(formatRemainingRough(3_600_000)).toBe("約1時間後");
    expect(formatRemainingRough(3_660_000)).toBe("約1時間1分後");
    expect(formatRemainingRough(7_200_000)).toBe("約2時間後");
  });

  it("期限を過ぎていたら待ち時間として出さない", () => {
    expect(formatRemainingRough(0)).toBe("まもなく");
  });
});

describe("formatDuration", () => {
  it("0 の単位を省いて並べる", () => {
    expect(formatDuration(3_630_000)).toBe("1時間30秒");
    expect(formatDuration(300_000)).toBe("5分");
  });
});
