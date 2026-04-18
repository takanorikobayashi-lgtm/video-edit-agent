import fs from "fs";
import path from "path";
import {
  PipelineConfig,
  ProductionPlan,
  AnalysisScript,
  AudioManifest,
  AudioEntry,
  StepResult,
} from "../types";
import { log, logStepStart, logStepDone, logError } from "../logger";

function getAudioDuration(filePath: string): number {
  const { execFileSync } = require("child_process");
  try {
    const raw = execFileSync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      filePath,
    ]).toString();
    const info = JSON.parse(raw);
    return parseFloat(info.format?.duration ?? "0");
  } catch {
    return 0;
  }
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;
  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function synthesizeWithGemini(
  text: string,
  apiKey: string,
  outputPath: string
): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" },
        },
      },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini TTS error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as any;
  const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  const mimeType = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType ?? "";

  if (!audioData) throw new Error("Gemini TTS: 音声データが返ってきませんでした");

  const rawBuffer = Buffer.from(audioData, "base64");
  const rawPath = outputPath.replace(".mp3", ".raw");
  fs.writeFileSync(rawPath, rawBuffer);

  const { execFileSync } = require("child_process");
  const rateMatch = mimeType.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? rateMatch[1] : "24000";

  execFileSync("ffmpeg", [
    "-y",
    "-f", "s16le",
    "-ar", sampleRate,
    "-ac", "1",
    "-i", rawPath,
    "-codec:a", "libmp3lame",
    "-q:a", "2",
    outputPath,
  ]);

  fs.unlinkSync(rawPath);
}

export async function run(config: PipelineConfig, plan: ProductionPlan): Promise<StepResult> {
  const start = Date.now();
  logStepStart("narrator");

  if (!plan.narration) {
    log("narrator", "ナレーション不要 (plan.narration=false) — スキップ");
    return { step: "narrate", success: true, durationMs: Date.now() - start };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

    const scriptPath = path.join(config.tmpDir, "script.json");
    if (!fs.existsSync(scriptPath)) throw new Error("script.json が見つかりません");

    const script: AnalysisScript = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
    const activeSegments = script.segments.filter((s) => s.keep && s.narration?.trim());
    log("narrator", `${activeSegments.length} セグメントの音声を生成します (Gemini TTS)`);

    const audioDir = path.join(config.tmpDir, "audio");
    fs.mkdirSync(audioDir, { recursive: true });

    for (const f of fs.readdirSync(audioDir).filter((f) => f.startsWith("segment-"))) {
      fs.unlinkSync(path.join(audioDir, f));
    }

    const tasks = activeSegments.map((segment) => {
      return async (): Promise<AudioEntry> => {
        const fileName = `segment-${String(segment.id).padStart(4, "0")}.mp3`;
        const filePath = path.join(audioDir, fileName);

        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
          try {
            await synthesizeWithGemini(segment.narration, apiKey, filePath);
            break;
          } catch (error: any) {
            if (attempt === config.maxRetries) throw error;
            const wait = Math.pow(2, attempt) * 1000;
            log("narrator", `リトライ ${attempt}/${config.maxRetries}... (${wait}ms待機)`);
            await new Promise((r) => setTimeout(r, wait));
          }
        }

        const duration = getAudioDuration(filePath);
        log("narrator", `✓ セグメント ${segment.id}: ${duration.toFixed(1)}秒`);

        return {
          segmentId: segment.id,
          filePath: path.resolve(filePath),
          duration,
          characterCount: segment.narration.length,
        };
      };
    });

    const entries = await runWithConcurrency(tasks, config.elevenLabsConcurrency);

    const manifest: AudioManifest = {
      entries,
      totalDuration: entries.reduce((sum, e) => sum + e.duration, 0),
      totalCharacters: entries.reduce((sum, e) => sum + e.characterCount, 0),
      voiceId: "Kore (Gemini TTS)",
    };

    const manifestPath = path.join(audioDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    log("narrator", `音声生成完了: 合計 ${manifest.totalDuration.toFixed(1)}秒`);

    const durationMs = Date.now() - start;
    logStepDone("narrator", durationMs);
    return { step: "narrate", success: true, durationMs, outputPath: audioDir };
  } catch (error) {
    logError("narrator", error);
    return { step: "narrate", success: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
  }
}
