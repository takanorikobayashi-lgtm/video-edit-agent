import fs from "fs";
import path from "path";
import { PipelineConfig, ProductionPlan, SubtitleStyle, StepResult, AnalysisScript, SubtitleEntry } from "../types";
import { log, logStepStart, logStepDone, logError } from "../logger";

export function styleToForceStyle(style: SubtitleStyle): string {
  const base = "FontSize=24\\,Outline=2\\,Shadow=1\\,MarginV=30";
  switch (style) {
    case "simple-white":
      return `${base}\\,PrimaryColour=&H00FFFFFF\\,BorderStyle=3`;
    case "yellow-box":
      return `${base}\\,PrimaryColour=&H0000FFFF\\,BorderStyle=3\\,BackColour=&H80000000`;
    case "gradient":
      return `${base}\\,PrimaryColour=&H00FFFFFF\\,BorderStyle=3\\,BackColour=&H801976D2`;
    case "semi-black":
      return `${base}\\,PrimaryColour=&H00FFFFFF\\,BorderStyle=4\\,BackColour=&H80000000`;
  }
}

function toSRTTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function writeSRT(subtitles: SubtitleEntry[], outputPath: string): void {
  const srt = subtitles
    .map((s) => `${s.id}\n${toSRTTime(s.startTime)} --> ${toSRTTime(s.endTime)}\n${s.text}\n`)
    .join("\n");
  fs.writeFileSync(outputPath, srt, "utf-8");
}

export async function run(config: PipelineConfig, plan: ProductionPlan): Promise<StepResult> {
  const start = Date.now();
  logStepStart("subtitler");

  if (!plan.subtitles.enabled) {
    log("subtitler", "字幕不要 (plan.subtitles.enabled=false) — スキップ");
    return { step: "subtitle", success: true, durationMs: Date.now() - start };
  }

  try {
    let subtitles: SubtitleEntry[] = [];

    if (plan.mode === "screen") {
      const scriptPath = path.join(config.tmpDir, "script.json");
      if (!fs.existsSync(scriptPath)) throw new Error("script.json が見つかりません");
      const script: AnalysisScript = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
      subtitles = script.segments
        .filter((s) => s.keep && s.narration?.trim())
        .map((s, i) => ({ id: i + 1, startTime: s.startTime, endTime: s.endTime, text: s.narration }));
    } else {
      const subPath = path.join(config.tmpDir, "subtitles.json");
      if (!fs.existsSync(subPath)) throw new Error("subtitles.json が見つかりません");
      const data = JSON.parse(fs.readFileSync(subPath, "utf-8"));
      subtitles = data.subtitles ?? [];
    }

    const styledSrtPath = path.join(config.tmpDir, "subtitles-styled.srt");
    writeSRT(subtitles, styledSrtPath);
    log("subtitler", `字幕 ${subtitles.length} 件を ${plan.subtitles.style} スタイルで保存`);

    const durationMs = Date.now() - start;
    logStepDone("subtitler", durationMs);
    return { step: "subtitle", success: true, durationMs, outputPath: styledSrtPath };
  } catch (error) {
    logError("subtitler", error);
    return { step: "subtitle", success: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
  }
}
