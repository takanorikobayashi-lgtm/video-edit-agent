import { describe, it, expect } from "vitest";
import { styleToForceStyle } from "../../src/skills/subtitler";

describe("styleToForceStyle", () => {
  it("returns correct ASS style for simple-white", () => {
    const style = styleToForceStyle("simple-white");
    expect(style).toContain("PrimaryColour=&H00FFFFFF");
    expect(style).toContain("BorderStyle=3");
  });

  it("returns yellow color for yellow-box", () => {
    const style = styleToForceStyle("yellow-box");
    expect(style).toContain("PrimaryColour=&H0000FFFF");
  });

  it("returns semi-transparent background for semi-black", () => {
    const style = styleToForceStyle("semi-black");
    expect(style).toContain("BackColour=&H80000000");
  });
});
