import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { PipelineConfig, ProductionPlan, CutRegion, StepResult } from "../types";
import { log, logStepStart, logStepDone, logError } from "../logger";

export function prioritizeCuts(
  cuts: CutRegion[],
  sourceDurationSec: number,
  targetLengthSec: number
): CutRegion[] {
  const needToCut = sourceDurationSec - targetLengthSec;
  if (needToCut <= 0) return cuts;

  const sorted = [...cuts].sort(
    (a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime)
  );
  const selected: CutRegion[] = [];
  let accumulated = 0;
  for (const cut of sorted) {
    selected.push(cut);
    accumulated += cut.endTime - cut.startTime;
    if (accumulated >= needToCut) break;
  }
  return selected;
}

function detectSilence(inputFile: string): CutRegion[] {
  let output = "";
  try {
    execFileSync(
      "ffmpeg",
      ["-i", inputFile, "-af", "silencedetect=noise=-30dB:duration=0.8", "-f", "null", "-"],
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
  } catch (e: any) {
    output = e.stderr ?? "";
  }
  const starts = [...output.matchAll(/silence_start: ([\d.]+)/g)].map((m) => parseFloat(m[1]));
  const ends = [...output.matchAll(/silence_end: ([\d.]+)/g)].map((m) => parseFloat(m[1]));
  return starts.slice(0, ends.length).map((s, i) => ({
    startTime: s,
    endTime: ends[i],
    reason: "無音区間",
  }));
}

export async function run(config: PipelineConfig, plan: ProductionPlan): Promise<StepResult> {
  const start = Date.now();
  logStepStart("silence-cutter");
  try {
    const metadataPath = path.join(config.tmpDir, "metadata.json");
    if (!fs.existsSync(metadataPath)) throw new Error("metadata.json が見つかりません");
    const { duration } = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

    log("silence-cutter", "無音区間を検出中...");
    const rawCuts = detectSilence(config.inputFile);
    log("silence-cutter", `${rawCuts.length} 箇所の無音区間を検出`);

    const selectedCuts = prioritizeCuts(rawCuts, duration, plan.targetLength);
    log("silence-cutter", `${selectedCuts.length} 箇所をカット対象に選択`);

    const cutListPath = path.join(config.tmpDir, "cut-list.json");
    fs.writeFileSync(cutListPath, JSON.stringify({ cuts: selectedCuts }, null, 2));

    const durationMs = Date.now() - start;
    logStepDone("silence-cutter", durationMs);
    return { step: "extract" as any, success: true, durationMs, outputPath: cutListPath };
  } catch (error) {
    logError("silence-cutter", error);
    return { step: "extract" as any, success: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
  }
}
