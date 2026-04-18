import fs from "fs";
import path from "path";
import {
  PipelineConfig,
  ProductionPlan,
  HearingAnswers,
  VideoMode,
  StepResult,
} from "../types";
import { log, logStepStart, logStepDone, logError } from "../logger";
import { extract } from "../01-extract";
import { run as runScreenAnalyzer } from "./screen-analyzer";
import { run as runNarrator } from "./narrator";
import { run as runTranscriber } from "./transcriber";
import { run as runSilenceCutter } from "./silence-cutter";
import { run as runSubtitler } from "./subtitler";
import { run as runEffectsArtist } from "./effects-artist";
import { run as runRenderer } from "./renderer";

type SkillRunner = (config: PipelineConfig, plan: ProductionPlan) => Promise<StepResult>;

const SKILL_MAP: Record<string, SkillRunner> = {
  "screen-analyzer": runScreenAnalyzer,
  "narrator":        runNarrator,
  "transcriber":     runTranscriber,
  "silence-cutter":  runSilenceCutter,
  "subtitler":       runSubtitler,
  "effects-artist":  runEffectsArtist,
  "renderer":        runRenderer,
};

export function buildSkillSequence(mode: VideoMode, hearing: HearingAnswers): string[] {
  const seq: string[] = ["extract"];

  if (mode === "screen") {
    seq.push("screen-analyzer");
    if (hearing.narration) seq.push("narrator");
  } else {
    seq.push("transcriber", "silence-cutter");
  }

  if (hearing.subtitles.enabled) seq.push("subtitler");
  if (hearing.effects.enabled && mode === "screen") seq.push("effects-artist");
  seq.push("renderer");

  return seq;
}

function buildApprovalGates(hearing: HearingAnswers, mode: VideoMode): string[] {
  const gates: string[] = ["timeline"];
  if (mode === "screen" && hearing.narration) gates.push("narration-text");
  if (hearing.subtitles.enabled) gates.push("subtitle-text");
  gates.push("cut-list");
  return gates;
}

export function buildPlan(hearing: HearingAnswers, mode: VideoMode): ProductionPlan {
  return {
    mode,
    purpose: hearing.purpose,
    targetLength: hearing.targetLength,
    subtitles: hearing.subtitles,
    narration: hearing.narration,
    effects: hearing.effects,
    skillSequence: buildSkillSequence(mode, hearing),
    approvalGates: buildApprovalGates(hearing, mode),
  };
}

export async function execute(
  plan: ProductionPlan,
  config: PipelineConfig,
  onProgress?: (skillName: string, result: StepResult) => void
): Promise<StepResult[]> {
  logStepStart("director");

  if (fs.existsSync(config.tmpDir)) {
    for (const entry of fs.readdirSync(config.tmpDir)) {
      fs.rmSync(path.join(config.tmpDir, entry), { recursive: true, force: true });
    }
    log("director", "tmp/ をクリアしました");
  }
  fs.mkdirSync(config.tmpDir, { recursive: true });

  fs.writeFileSync(
    path.join(config.tmpDir, "production-plan.json"),
    JSON.stringify(plan, null, 2)
  );

  const results: StepResult[] = [];

  for (const skillName of plan.skillSequence) {
    log("director", `▶ ${skillName} 開始`);

    let result: StepResult;

    if (skillName === "extract") {
      result = await extract(config);
    } else {
      const runner = SKILL_MAP[skillName];
      if (!runner) {
        log("director", `⚠ 未知のSkill: ${skillName} — スキップ`);
        continue;
      }

      result = { step: skillName as any, success: false, durationMs: 0 };
      for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
        try {
          result = await runner(config, plan);
          break;
        } catch (err) {
          if (attempt === config.maxRetries) {
            result = {
              step: skillName as any,
              success: false,
              durationMs: 0,
              error: String(err),
            };
          } else {
            const wait = Math.pow(2, attempt) * 1000;
            log("director", `${skillName} リトライ ${attempt}/${config.maxRetries} (${wait}ms待機)`);
            await new Promise((r) => setTimeout(r, wait));
          }
        }
      }
    }

    results.push(result);
    onProgress?.(skillName, result);

    if (!result.success) {
      logError("director", new Error(`${skillName} 失敗: ${result.error}`));
      break;
    }
  }

  const allSuccess = results.every((r) => r.success);
  const totalMs = results.reduce((s, r) => s + r.durationMs, 0);
  logStepDone("director", totalMs);
  log("director", allSuccess ? "✓ パイプライン完了" : "⚠ パイプライン部分失敗");

  return results;
}
