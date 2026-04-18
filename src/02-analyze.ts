import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import {
  PipelineConfig,
  VideoMetadata,
  AnalysisScript,
  ScriptSegment,
  CutRegion,
  StepResult,
} from "./types";
import { log, logStepStart, logStepDone, logError } from "./logger";

function encodeFrame(framePath: string): string {
  return fs.readFileSync(framePath).toString("base64");
}

function createBatches(frames: string[], batchSize: number, overlap: number): string[][] {
  const batches: string[][] = [];
  let i = 0;
  while (i < frames.length) {
    const end = Math.min(i + batchSize, frames.length);
    batches.push(frames.slice(i, end));
    if (end === frames.length) break;
    i = end - overlap;
    if (i >= frames.length) break;
  }
  return batches;
}

async function callWithRetry<T>(fn: () => Promise<T>, retries: number = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt === retries) throw error;
      const wait = Math.pow(2, attempt) * 1000;
      log("analyze", `リトライ ${attempt}/${retries}... (${wait}ms待機)`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error("unreachable");
}

async function analyzeBatch(
  model: any,
  framePaths: string[],
  batchIndex: number,
  startFrameGlobal: number,
  fps: number,
  previousContext: string
): Promise<{ segments: ScriptSegment[]; cuts: CutRegion[]; context: string }> {

  const prompt = `あなたは画面録画を解析してチュートリアル動画の解説を作成するエキスパートです。

## タスク
提供されるスクリーンショット（フレーム）を時系列で分析し、以下を生成してください:
1. セグメント分割: 操作のまとまりごとにセグメントに分割
2. ナレーション: 各セグメントの操作を視聴者に説明する日本語ナレーション（「〜します」調）
3. カット判定: 画面に変化がないフレームが連続する区間を「不要」としてマーク

## ナレーションルール
- 「〜します」「〜をクリックします」のような丁寧な解説調
- 1セグメントのナレーションは2-3文（30秒以内で読める長さ）
- 具体的なUI要素名を含める

${previousContext ? `## 前のバッチの状態\n${previousContext}\n` : ""}

## フレーム情報
${framePaths.map((_, i) => `Frame ${startFrameGlobal + i} (${((startFrameGlobal + i) / fps).toFixed(1)}秒)`).join(", ")}

## 出力形式
必ず以下のJSONのみで回答してください（説明文不要）:
{
  "segments": [
    {
      "id": 1,
      "startFrame": 0,
      "endFrame": 5,
      "narration": "ナレーションテキスト",
      "action": "操作の要約",
      "keep": true
    }
  ],
  "cuts": [
    { "startFrame": 3, "endFrame": 7, "reason": "ページ読み込み待ち" }
  ],
  "contextSummary": "このバッチ終了時点での画面状態の要約"
}`;

  const imageParts = framePaths.map((fp) => ({
    inlineData: {
      data: encodeFrame(fp),
      mimeType: "image/png" as const,
    },
  }));

  const response = await callWithRetry<any>(() =>
    model.generateContent([prompt, ...imageParts])
  );

  const text = response.response.text();
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error(`バッチ ${batchIndex}: JSONレスポンスの解析に失敗`);

  const parsed = JSON.parse(jsonMatch[1]);

  const segments: ScriptSegment[] = (parsed.segments ?? []).map((seg: any) => ({
    ...seg,
    startFrame: seg.startFrame + startFrameGlobal,
    endFrame: seg.endFrame + startFrameGlobal,
    startTime: (seg.startFrame + startFrameGlobal) / fps,
    endTime: (seg.endFrame + startFrameGlobal) / fps,
    keep: seg.keep ?? true,
  }));

  const cuts: CutRegion[] = (parsed.cuts ?? []).map((cut: any) => ({
    startTime: (cut.startFrame + startFrameGlobal) / fps,
    endTime: (cut.endFrame + startFrameGlobal) / fps,
    reason: cut.reason,
  }));

  return { segments, cuts, context: parsed.contextSummary ?? "" };
}

function deduplicateSegments(segments: ScriptSegment[]): ScriptSegment[] {
  if (segments.length === 0) return [];
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const result: ScriptSegment[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];
    const overlapStart = Math.max(prev.startTime, curr.startTime);
    const overlapEnd = Math.min(prev.endTime, curr.endTime);
    const overlapDuration = Math.max(0, overlapEnd - overlapStart);
    const currDuration = curr.endTime - curr.startTime;
    if (currDuration > 0 && overlapDuration / currDuration < 0.8) {
      result.push(curr);
    }
  }
  return result.map((seg, i) => ({ ...seg, id: i + 1 }));
}

export async function analyze(config: PipelineConfig): Promise<StepResult> {
  const start = Date.now();
  logStepStart("analyze");

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

    const metadataPath = path.join(config.tmpDir, "metadata.json");
    if (!fs.existsSync(metadataPath)) throw new Error("metadata.json が見つかりません。先に extract を実行してください");

    const metadata: VideoMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    const framesDir = path.join(config.tmpDir, "frames");
    const allFrames = fs.readdirSync(framesDir).filter((f) => f.endsWith(".png")).sort().map((f) => path.join(framesDir, f));

    log("analyze", `${allFrames.length} フレームを解析します (Gemini 2.5 Pro)`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const batches = createBatches(allFrames, config.maxBatchSize, config.batchOverlap);
    log("analyze", `${batches.length} バッチに分割`);

    let allSegments: ScriptSegment[] = [];
    let allCuts: CutRegion[] = [];
    let previousContext = "";
    let globalSegmentId = 1;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const startFrameGlobal = i === 0 ? 0 : i * (config.maxBatchSize - config.batchOverlap);
      log("analyze", `バッチ ${i + 1}/${batches.length} (${batch.length}フレーム) 解析中...`);

      const result = await analyzeBatch(model, batch, i, startFrameGlobal, metadata.fps, previousContext);

      for (const seg of result.segments) seg.id = globalSegmentId++;
      allSegments.push(...result.segments);
      allCuts.push(...result.cuts);
      previousContext = result.context;

      log("analyze", `バッチ ${i + 1}: ${result.segments.length}セグメント, ${result.cuts.length}カット区間`);
    }

    allSegments = deduplicateSegments(allSegments);

    const script: AnalysisScript = {
      segments: allSegments,
      cuts: allCuts,
      totalDuration: metadata.duration,
      analyzedFrames: allFrames.length,
    };

    const scriptPath = path.join(config.tmpDir, "script.json");
    fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2));
    log("analyze", `解析完了: ${allSegments.length}セグメント, ${allCuts.length}カット区間`);

    const durationMs = Date.now() - start;
    logStepDone("analyze", durationMs);
    return { step: "analyze", success: true, durationMs, outputPath: scriptPath };

  } catch (error) {
    logError("analyze", error);
    return { step: "analyze", success: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
  }
}
