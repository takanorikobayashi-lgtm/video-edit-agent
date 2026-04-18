#!/usr/bin/env npx ts-node
import fs from "fs";
import path from "path";
import * as readline from "readline";
import { config as loadDotenv } from "dotenv";
import { PipelineConfig, ModeConfig, StepResult, HearingAnswers, SubtitleStyle, EffectType, VideoMode } from "./types";
import { loadConfig } from "./config";
import { log, logError } from "./logger";
import { detect } from "./00-detect";
import { extract } from "./01-extract";
import { analyze } from "./02-analyze";
import { transcribe } from "./02b-transcribe";
import { narrate } from "./03-narrate";
import { render } from "./04-render";
import { buildPlan, execute as directorExecute } from "./skills/director";

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

async function askCLI(question: string, choices: string[]): Promise<number> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log(`\n${question}`);
    choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    rl.question("番号を入力: ", (answer) => {
      rl.close();
      const n = parseInt(answer.trim(), 10);
      resolve(isNaN(n) ? 1 : Math.min(Math.max(n, 1), choices.length));
    });
  });
}

async function runCLIHearing(mode: VideoMode, videoDurationSec: number): Promise<HearingAnswers> {
  const purposeChoices = mode === "screen"
    ? ["操作レクチャー解説", "プレゼン解説", "サービス解説"]
    : ["TikTok / ショート", "Vlog / 日常", "プロモーション / 商品紹介"];
  const purposeMap = mode === "screen"
    ? ["tutorial" as const, "lecture" as const, "tiktok" as const]
    : ["tiktok" as const, "vlog" as const, "promo" as const];
  const purposeIdx = await askCLI("動画の目的を選択してください:", purposeChoices) - 1;
  const purpose = purposeMap[purposeIdx];

  const allLengths = [30, 60, 180, 300, 600];
  const validLengths = allLengths.filter((l) => l <= videoDurationSec * 0.9);
  if (validLengths.length === 0) validLengths.push(Math.floor(videoDurationSec * 0.9));
  const lengthIdx = await askCLI("完成動画の長さ:", validLengths.map((l) => `${l}秒`)) - 1;
  const targetLength = validLengths[lengthIdx];

  const subAnswer = await askCLI("字幕を追加しますか?", ["はい", "いいえ"]);
  let subtitleStyle: SubtitleStyle = "simple-white";
  if (subAnswer === 1) {
    const styleIdx = await askCLI("字幕スタイル:", ["シンプル白文字", "黄色ボックス", "グラデ背景", "半透明黒帯"]) - 1;
    const styles: SubtitleStyle[] = ["simple-white", "yellow-box", "gradient", "semi-black"];
    subtitleStyle = styles[styleIdx];
  }

  const fxAnswer = await askCLI("エフェクトを追加しますか?", ["はい", "いいえ"]);
  let effectTypes: EffectType[] = [];
  if (fxAnswer === 1 && mode === "screen") {
    const fxIdx = await askCLI("エフェクトの種類:", ["ズームイン", "ズームアウト", "パンレフト", "パンライト"]) - 1;
    const fxMap: EffectType[] = ["zoomIn", "zoomOut", "panLeft", "panRight"];
    effectTypes = [fxMap[fxIdx]];
  }

  let narration = false;
  if (mode === "screen") {
    const narAnswer = await askCLI("ナレーション（音声解説）を生成しますか?", ["はい", "いいえ"]);
    narration = narAnswer === 1;
  }

  return {
    purpose,
    targetLength,
    subtitles: { enabled: subAnswer === 1, style: subtitleStyle },
    narration,
    effects: { enabled: fxAnswer === 1 && mode === "screen", types: effectTypes },
  };
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
    // フルパイプライン: detect → CLIヒアリング → director.execute()
    log("system", "フルパイプラインを実行します");
    console.log("");

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

    // メタデータから動画長を取得（ヒアリングの長さ選択に使う）
    const metaPath = path.join(config.tmpDir, "metadata.json");
    const videoDuration = fs.existsSync(metaPath)
      ? (JSON.parse(fs.readFileSync(metaPath, "utf-8")).duration as number)
      : 600;

    const hearing = await runCLIHearing(modeConfig.mode, videoDuration);
    const plan = buildPlan(hearing, modeConfig.mode);

    log("system", `制作プラン: mode=${plan.mode}, purpose=${plan.purpose}, targetLength=${plan.targetLength}s`);
    log("system", `スキルシーケンス: ${plan.skillSequence.join(" → ")}`);
    console.log("");

    const skillResults = await directorExecute(plan, config, (skillName, result) => {
      const icon = result.success ? "✓" : "✗";
      log("director", `${icon} ${skillName} (${(result.durationMs / 1000).toFixed(1)}s)`);
      console.log("");
    });
    results.push(...skillResults);
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
