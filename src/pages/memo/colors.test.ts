import { strict as assert } from "node:assert";
import { describe, it } from "vitest";

import {
  MEMO_DEFAULT_COLOR,
  isMemoColor,
  normalizeMemoColor,
  parseMemoColor,
} from "./colors";

describe("parseMemoColor", () => {
  it("前後の空白と大文字を無視して色名を返す", () => {
    assert.equal(parseMemoColor(" red "), "red");
    assert.equal(parseMemoColor("YELLOW"), "yellow");
  });

  it("空や未知の名前は null", () => {
    assert.equal(parseMemoColor(""), null);
    assert.equal(parseMemoColor("  "), null);
    assert.equal(parseMemoColor("orange"), null);
  });
});

describe("normalizeMemoColor", () => {
  it("不正値は既定色に落とす", () => {
    assert.equal(normalizeMemoColor(undefined), MEMO_DEFAULT_COLOR);
    assert.equal(normalizeMemoColor("orange"), MEMO_DEFAULT_COLOR);
    assert.equal(normalizeMemoColor("blue"), "blue");
  });
});

describe("isMemoColor", () => {
  it("5 色だけを認める", () => {
    assert.equal(isMemoColor("green"), true);
    assert.equal(isMemoColor("pink"), false);
  });
});
