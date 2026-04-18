import { describe, it, expect } from "vitest";
import { buildPlan, buildSkillSequence } from "../../src/skills/director";
import { HearingAnswers } from "../../src/types";

const baseAnswers: HearingAnswers = {
  purpose: "tutorial",
  targetLength: 180,
  subtitles: { enabled: true, style: "simple-white" },
  narration: true,
  effects: { enabled: false, types: [] },
};

describe("buildSkillSequence", () => {
  it("Mode A with narration and subtitles", () => {
    const seq = buildSkillSequence("screen", { ...baseAnswers, narration: true, subtitles: { enabled: true, style: "simple-white" } });
    expect(seq).toContain("screen-analyzer");
    expect(seq).toContain("narrator");
    expect(seq).toContain("subtitler");
    expect(seq[seq.length - 1]).toBe("renderer");
  });

  it("Mode A without narration still includes subtitler", () => {
    const seq = buildSkillSequence("screen", { ...baseAnswers, narration: false });
    expect(seq).not.toContain("narrator");
    expect(seq).toContain("screen-analyzer");
    expect(seq).toContain("subtitler");
  });

  it("Mode B sequence", () => {
    const seq = buildSkillSequence("short", { ...baseAnswers, effects: { enabled: true, types: ["zoomIn"] } });
    expect(seq).toContain("transcriber");
    expect(seq).toContain("silence-cutter");
    // Mode B は effects-artist をスキップ
    expect(seq).not.toContain("effects-artist");
    expect(seq[seq.length - 1]).toBe("renderer");
  });

  it("Mode A with effects", () => {
    const seq = buildSkillSequence("screen", { ...baseAnswers, effects: { enabled: true, types: ["zoomIn"] } });
    expect(seq).toContain("effects-artist");
  });
});

describe("buildPlan", () => {
  it("generates correct plan from hearing answers", () => {
    const plan = buildPlan(baseAnswers, "screen");
    expect(plan.mode).toBe("screen");
    expect(plan.purpose).toBe("tutorial");
    expect(plan.targetLength).toBe(180);
    expect(plan.narration).toBe(true);
    expect(plan.subtitles.enabled).toBe(true);
    expect(plan.skillSequence).toContain("screen-analyzer");
    expect(plan.approvalGates).toContain("timeline");
  });
});
