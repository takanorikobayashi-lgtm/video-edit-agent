#!/usr/bin/env npx ts-node
import fs from "fs";
import path from "path";
import { config as loadDotenv } from "dotenv";
import { PipelineConfig, ModeConfig, StepResult } from "./types";
import { loadConfig } from "./config";
import { log, logError } from "./logger";
import { detect } from "./00-detect";
import { extract } from "./01-extract";
import { analyze } from "./02-analyze";
import { transcribe } from "./02b-transcribe";
import { narrate } from "./03-narrate";
import { render } from "./04-render";

loadDotenv({ path: path.resolve(__dirname, "..", ".env") });

interface CliArgs {
  input?: string;
  step?: string;
  fps?: number;
  dryRun: boolean;
  mode?: "screen" | "short";
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false };
  let i = 2;
  while (i < argv.length) {
    switch (argv[i]) {
      case "--input": case "-i": args.input = argv[++i]; break;
      case "--step": case "-s": args.step = argv[++i]; break;
      case "--fps": args.fps = parseInt(argv[++i], 10); break;
      case "--dry-run": args.dryRun = true; break;
      case "--mode": args.mode = argv[++i] as any; break;
      case "--help": printHelp(); process.exit(0);
      default:
        if (!argv[i].startsWith("-") && !args.input) args.input = argv[i];
    }
    i++;
  }
  return args;
}

function printHelp(): void {
  console.log(`
Video Edit Agent — Multi-mode Pipeline

Usage:
  npx ts-node src/orchestrator.ts [options] [input-file]

Options:
  --input, -i <path>    入力動画ファイルパス
  --step, -s <name>     個別ステップ実行: detect | extract | analyze | transcribe | narrate | render
  --mode <type>         強制モード指定: screen | short
  --fps <number>        フレーム抽出fps (default: 1)
  --dry-run             設定確認のみ
  --help                このヘルプを表示

Examples:
  npx ts-node src/orchestrator.ts --input demo.mp4
  npx ts-node src/orchestrator.ts --step detect
  npx ts-node src/orchestrator.ts --mode short --input vlog.mp4
`);
}

function clearTmpDir(tmpDir: string): void {
  if (!fs.existsSync(tmpDir)) return;
  for (const entry of fs.readdirSync(tmpDir)) {
    fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
  }
  log("system", "tmp/ をクリアしました");
}

function loadDetection(tmpDir: string): { modeConfig: ModeConfig; inputFile?: string } | null {
  const detectionPath = path.join(tmpDir, "detection.json");
  if (!fs.existsSync(detectionPath)) return null;
  const data = JSON.parse(fs.readFileSync(detectionPath, "utf-8"));
  if (!data.modeConfig) return null;
  return { modeConfig: data.modeConfig, inputFile: data.inputFile };
}

async function runScreenPipeline(
  config: PipelineConfig,
  modeConfig: ModeConfig,
  startStep: string | undefined
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const steps = ["extract", "analyze", "narrate", "render"];
  const startIdx = startStep ? steps.indexOf(startStep) : 0;
  const activeSteps = steps.slice(Math.max(0, startIdx));

  console.log("");
  log("system", "Mode A: 画面収録パイプライン");
  log("system", `ステップ: ${activeSteps.join(" → ")}`);
  console.log("");

  for (const step of activeSteps) {
    let result: StepResult;
    switch (step) {
      case "extract": result = await extract(config); break;
      case "analyze": result = await analyze(config); break;
      case "narrate": result = await narrate(config); break;
      case "render":  result = await render(config); break;
      default: continue;
    }
    results.push(result);
    console.log("");
    if (!result.success) {
      log("error", `${step} が失敗しました: ${result.error}`);
      break;
    }
  }
  return results;
}

async function runShortPipeline(
  config: PipelineConfig,
  modeConfig: ModeConfig,
  startStep: string | undefined
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const steps = ["extract", "transcribe", "render"];
  const startIdx = startStep ? steps.indexOf(startStep) : 0;
  const activeSteps = steps.slice(Math.max(0, startIdx));

  console.log("");
  log("system", "Mode B: ショート動画パイプライン");
  log("system", `ステップ: ${activeSteps.join(" → ")}`);
  console.log("");

  for (const step of activeSteps) {
    let result: StepResult;
    switch (step) {
      case "extract":    result = await extract(config); break;
      case "transcribe": result = await transcribe(config); break;
      case "render":     result = await render(config); break;
      default: continue;
    }
    results.push(result);
    console.log("");
    if (!result.success) {
      log("error", `${step} が失敗しました: ${result.error}`);
      break;
    }
  }
  return results;
}

async function main(): Promise<void> {
  const cliArgs = parseArgs(process.argv);

  const overrides: Partial<PipelineConfig> = {};
  if (cliArgs.input) overrides.inputFile = path.resolve(cliArgs.input);
  if (cliArgs.fps)   overrides.extractFps = cliArgs.fps;

  const config = loadConfig(overrides);

  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║       Video Edit Agent — Multi-mode              ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");

  log("system", `入力: ${config.inputFile}`);

  if (cliArgs.dryRun) {
    console.log("\n[DRY RUN] 設定確認のみ");
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  fs.mkdirSync(config.tmpDir, { recursive: true });
  fs.mkdirSync(config.outputDir, { recursive: true });

  const pipelineStart = Date.now();
  let results: StepResult[] = [];

  // 個別ステップ実行
  if (cliArgs.step) {
    if (cliArgs.step === "detect") {
      const result = await detect(config);
      results.push(result);
    } else {
      // detection.json から既存のモード設定を読む
      let detectionData = loadDetection(config.tmpDir);

      // --mode で強制指定
      if (cliArgs.mode) {
        detectionData = { modeConfig: {
          mode: cliArgs.mode,
          purpose: "tutorial",
          subtitles: true,
          narration: cliArgs.mode === "screen",
          effects: true,
          effectTypes: ["zoomIn", "zoomOut", "panLeft", "panRight"],
          cutSilence: cliArgs.mode === "short",
        } };
      }

      if (!detectionData) {
        log("error", "detection.json が見つかりません。先に detect を実行してください");
        log("error", "または --mode screen / --mode short で強制指定してください");
        process.exit(1);
      }

      const modeConfig2 = detectionData.modeConfig;
      if (detectionData.inputFile && !cliArgs.input) {
        config.inputFile = detectionData.inputFile;
        log("system", `入力ファイルを detection.json から引き継ぎ: ${config.inputFile}`);
      }

      if (modeConfig2.mode === "screen") {
        results = await runScreenPipeline(config, modeConfig2, cliArgs.step);
      } else {
        results = await runShortPipeline(config, modeConfig2, cliArgs.step);
      }
    }
  } else {
    // フルパイプライン
    log("system", "フルパイプラインを実行します");
    console.log("");

    clearTmpDir(config.tmpDir);
    fs.mkdirSync(config.tmpDir, { recursive: true });

    // detect で環境変数チェック
    if (!process.env.GEMINI_API_KEY) {
      log("error", "GEMINI_API_KEY が設定されていません");
      process.exit(1);
    }

    const detectResult = await detect(config);
    results.push(detectResult);
    console.log("");

    if (!detectResult.success) {
      log("error", "モード判定に失敗しました");
      process.exit(1);
    }

    const detectionResult = loadDetection(config.tmpDir)!;
    const modeConfig = detectionResult.modeConfig;
    if (detectionResult.inputFile && !cliArgs.input) {
      config.inputFile = detectionResult.inputFile;
      log("system", `入力ファイルを detection.json から引き継ぎ: ${config.inputFile}`);
    }

    if (modeConfig.mode === "screen") {
      results.push(...await runScreenPipeline(config, modeConfig, undefined));
    } else {
      results.push(...await runShortPipeline(config, modeConfig, undefined));
    }
  }

  // サマリー表示
  const totalMs = Date.now() - pipelineStart;
  const LABELS: Record<string, string> = {
    detect: "モード判定", extract: "フレーム抽出",
    analyze: "画面解析", transcribe: "文字起こし",
    narrate: "ナレーション生成", render: "動画レンダリング",
  };

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Pipeline Summary");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const r of results) {
    const icon = r.success ? "✓" : "✗";
    const sec = (r.durationMs / 1000).toFixed(1);
    const label = (LABELS[r.step] ?? r.step).padEnd(16);
    console.log(`  ${icon} ${label} ${sec}s`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Total: ${(totalMs / 1000).toFixed(1)}s`);

  const allSuccess = results.every((r) => r.success);
  if (allSuccess) {
    const outputFile = results.find((r) => r.step === "render")?.outputPath;
    if (outputFile) console.log(`\n  → 完成動画: ${outputFile}`);
    console.log("\n  ✓ パイプライン完了!\n");
  } else {
    console.log("\n  ✗ パイプラインは途中で失敗しました\n");
    process.exit(1);
  }
}

main().catch((err) => {
  logError("system", err);
  process.exit(1);
});
