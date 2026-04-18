import { describe, it, expect } from "vitest";
import { prioritizeCuts } from "../../src/skills/silence-cutter";

describe("prioritizeCuts", () => {
  it("returns cuts that bring duration close to targetLength", () => {
    const cuts = [
      { startTime: 10, endTime: 25, reason: "silence" },  // 15秒
      { startTime: 30, endTime: 48, reason: "silence" },  // 18秒 ← 長い
      { startTime: 50, endTime: 52, reason: "silence" },  // 2秒
    ];
    // 元動画60秒、target30秒 → 30秒分カットが必要
    const result = prioritizeCuts(cuts, 60, 30);
    // 合計カット量が目標差分(30秒)以上
    const totalCut = result.reduce((s, c) => s + (c.endTime - c.startTime), 0);
    expect(totalCut).toBeGreaterThanOrEqual(30);
    // 長いカットが先に選ばれる
    expect(result[0].endTime - result[0].startTime).toBe(18);
  });

  it("returns all cuts when total duration is already within target", () => {
    const cuts = [{ startTime: 5, endTime: 8, reason: "silence" }];
    const result = prioritizeCuts(cuts, 20, 25);  // target > duration → 全部返す
    expect(result).toHaveLength(1);
  });
});
