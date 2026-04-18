import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { PipelineConfig, ProductionPlan, SubtitleEntry, StepResult } from "../types";
import { log, logStepStart, logStepDone, logError } from "../logger";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function extractAudio(inputFile: string, tmpDir: string): string {
  const audioPath = path.join(tmpDir, "audio-raw.mp3");
  execFileSync("ffmpeg", [
    "-y",
    "-i", inputFile,
    "-vn",
    "-acodec", "libmp3lame",
    "-q:a", "4",
    audioPath,
  ]);
  log("transcriber", `音声抽出完了: ${audioPath}`);
  return audioPath;
}

async function transcribeWithGemini(
  audioPath: string,
  apiKey: string
): Promise<SubtitleEntry[]> {
  const audioData = fs.readFileSync(audioPath).toString("base64");

  const body = {
    contents: [{
      parts: [
        {
          inlineData: {
            data: audioData,
            mimeType: "audio/mp3",
          },
        },
        {
          text: `この音声を文字起こしして、字幕データとして出力してください。

ルール:
- 話者の言葉をそのまま書き起こす
- 1字幕 = 約2-4秒分の発話
- タイムスタンプは秒単位（小数点2桁）

以下のJSON形式のみで回答してください（説明文不要）:
{
  "subtitles": [
    { "id": 1, "startTime": 0.00, "endTime": 3.50, "text": "こんにちは、今日は〇〇について" },
    { "id": 2, "startTime": 3.50, "endTime": 7.20, "text": "説明していきます" }
  ]
}`,
        },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini transcribe error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("文字起こしJSONの解析失敗");

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.subtitles ?? [];
}

function exportSRT(subtitles: SubtitleEntry[], outputPath: string): void {
  const toSRTTime = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.round((sec % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };

  const srt = subtitles
    .map((s) => `${s.id}\n${toSRTTime(s.startTime)} --> ${toSRTTime(s.endTime)}\n${s.text}\n`)
    .join("\n");

  fs.writeFileSync(outputPath, srt, "utf-8");
}

export async function run(config: PipelineConfig, _plan: ProductionPlan): Promise<StepResult> {
  const start = Date.now();
  logStepStart("transcriber");
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
    if (!fs.existsSync(config.inputFile)) throw new Error(`入力ファイルが見つかりません: ${config.inputFile}`);

    log("transcriber", "音声を抽出中...");
    const audioPath = extractAudio(config.inputFile, config.tmpDir);

    log("transcriber", "Gemini Audio で文字起こし中...");
    const subtitles = await transcribeWithGemini(audioPath, apiKey);
    log("transcriber", `${subtitles.length} 字幕エントリ生成`);

    const subtitleJsonPath = path.join(config.tmpDir, "subtitles.json");
    fs.writeFileSync(subtitleJsonPath, JSON.stringify({
      subtitles,
      totalEntries: subtitles.length,
    }, null, 2));

    const srtPath = path.join(config.tmpDir, "subtitles.srt");
    exportSRT(subtitles, srtPath);

    const audioDir = path.join(config.tmpDir, "audio");
    fs.mkdirSync(audioDir, { recursive: true });
    const finalAudioPath = path.join(audioDir, "original.mp3");
    fs.copyFileSync(audioPath, finalAudioPath);
    fs.unlinkSync(audioPath);

    const durationMs = Date.now() - start;
    logStepDone("transcriber", durationMs);
    return { step: "transcribe" as any, success: true, durationMs, outputPath: subtitleJsonPath };
  } catch (error) {
    logError("transcriber", error);
    return { step: "transcribe" as any, success: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
  }
}
