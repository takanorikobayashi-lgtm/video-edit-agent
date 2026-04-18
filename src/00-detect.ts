import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline";
import { PipelineConfig, VideoMode_Detection, ModeConfig, StepResult } from "./types";
import { log, logStepStart, logStepDone, logError } from "./logger";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function probeVideo(inputFile: string): {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  fps: number;
} {
  const raw = execFileSync("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    inputFile,
  ]).toString();

  const info = JSON.parse(raw);
  const videoStream = info.streams?.find((s: any) => s.codec_type === "video");
  const audioStream = info.streams?.find((s: any) => s.codec_type === "audio");

  const fpsRaw = videoStream?.r_frame_rate ?? "30/1";
  const [num, den] = fpsRaw.split("/").map(Number);
  const fps = Math.round(num / den);

  return {
    duration: parseFloat(info.format?.duration ?? "0"),
    width: videoStream?.width ?? 1920,
    height: videoStream?.height ?? 1080,
    hasAudio: !!audioStream,
    fps,
  };
}

function extractOneFrame(inputFile: string, tmpDir: string): string {
  const framePath = path.join(tmpDir, "detect-frame.png");
  execFileSync("ffmpeg", [
    "-y",
    "-ss", "3",
    "-i", inputFile,
    "-frames:v", "1",
    "-q:v", "2",
    framePath,
  ]);
  return framePath;
}

async function analyzeFrameWithGemini(
  framePath: string,
  apiKey: string
): Promise<{ hasScreenContent: boolean; hasSpeech: boolean; confidence: number; reasoning: string }> {
  const imageData = fs.readFileSync(framePath).toString("base64");

  const body = {
    contents: [{
      parts: [
        {
          inlineData: {
            data: imageData,
            mimeType: "image/png",
          },
        },
        {
          text: `この動画フレームを分析してください。

以下をJSONのみで回答してください（説明文不要）:
{
  "hasScreenContent": true/false,  // PC/スマホの画面録画・スクリーンショットか
  "hasSpeech": true/false,         // 人物が話している・カメラに向かっている映像か
  "confidence": 0-100,             // 判定の確信度
  "reasoning": "判定理由を1文で"
}`,
        },
      ],
    }],
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON解析失敗");
  return JSON.parse(jsonMatch[0]);
}

function askUser(question: string, choices: string[]): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const choiceStr = choices.map((c, i) => `  ${i + 1}. ${c}`).join("\n");
    rl.question(`\n${question}\n${choiceStr}\n\n番号を入力 > `, (answer) => {
      rl.close();
      const idx = parseInt(answer) - 1;
      resolve(choices[idx] ?? choices[0]);
    });
  });
}

function buildModeConfig(detection: VideoMode_Detection, purpose: string): ModeConfig {
  const isScreen = detection.mode === "screen";

  return {
    mode: detection.mode,
    purpose: detection.purpose,
    subtitles: true,
    narration: isScreen,
    effects: true,
    effectTypes: ["zoomIn", "zoomOut", "panLeft", "panRight"],
    cutSilence: !isScreen,
  };
}

export async function detect(config: PipelineConfig): Promise<StepResult> {
  const start = Date.now();
  logStepStart("detect");

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

    fs.mkdirSync(config.tmpDir, { recursive: true });

    // Step1: ffprobe で無料判定
    log("detect", "動画情報を解析中...");
    const probe = probeVideo(config.inputFile);
    log("detect", `動画: ${probe.width}x${probe.height}, ${probe.duration.toFixed(1)}秒, 音声: ${probe.hasAudio ? "あり" : "なし"}`);

    // Step2: 1フレームだけ Gemini Vision で解析
    log("detect", "1フレーム解析中... ($0.00003)");
    const framePath = extractOneFrame(config.inputFile, config.tmpDir);
    const geminiResult = await analyzeFrameWithGemini(framePath, apiKey);
    fs.unlinkSync(framePath);

    log("detect", `解析結果: 画面収録=${geminiResult.hasScreenContent}, 話者=${geminiResult.hasSpeech}, 確信度=${geminiResult.confidence}%`);
    log("detect", `判定理由: ${geminiResult.reasoning}`);

    // Step3: モード判定
    let mode: "screen" | "short";
    let purpose: string;

    // 確信度が高い場合は自動判定
    if (geminiResult.confidence >= 80) {
      mode = geminiResult.hasScreenContent ? "screen" : "short";
      log("detect", `自動判定: ${mode === "screen" ? "画面収録モード" : "ショート動画モード"}`);
    } else {
      // 確信度が低い場合のみユーザーに確認
      log("detect", "確信度が低いためユーザーに確認します...");
      const modeAnswer = await askUser(
        "動画の種類を選択してください:",
        ["画面収録 / チュートリアル", "ショート動画 / TikTok / Vlog"]
      );
      mode = modeAnswer.includes("画面") ? "screen" : "short";
    }

    // 目的を確認（短い質問1つ）
    const purposeAnswer = await askUser(
      "動画の目的を選択してください:",
      mode === "screen"
        ? ["チュートリアル / 解説", "プレゼン / デモ", "講義 / 研修"]
        : ["TikTok / ショート", "Vlog / 日常", "プロモーション / 商品紹介"]
    );

    const purposeMap: Record<string, string> = {
      "チュートリアル / 解説": "tutorial",
      "プレゼン / デモ": "promo",
      "講義 / 研修": "lecture",
      "TikTok / ショート": "tiktok",
      "Vlog / 日常": "vlog",
      "プロモーション / 商品紹介": "promo",
    };
    purpose = purposeMap[purposeAnswer] ?? "tutorial";

    const detection: VideoMode_Detection = {
      mode,
      purpose: purpose as any,
      confidence: geminiResult.confidence,
      hasSpeech: geminiResult.hasSpeech,
      hasScreenContent: geminiResult.hasScreenContent,
      durationSec: probe.duration,
      reasoning: geminiResult.reasoning,
    };

    const modeConfig = buildModeConfig(detection, purpose);

    // 結果を保存
    const detectionPath = path.join(config.tmpDir, "detection.json");
    fs.writeFileSync(detectionPath, JSON.stringify({ detection, modeConfig, inputFile: config.inputFile }, null, 2));

    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  モード    : ${mode === "screen" ? "画面収録" : "ショート動画"}`);
    console.log(`  目的      : ${purpose}`);
    console.log(`  字幕      : ${modeConfig.subtitles ? "あり" : "なし"}`);
    console.log(`  ナレーション: ${modeConfig.narration ? "あり" : "なし"}`);
    console.log(`  エフェクト  : ${modeConfig.effects ? "あり" : "なし"}`);
    console.log(`  無音カット  : ${modeConfig.cutSilence ? "あり" : "なし"}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");

    const durationMs = Date.now() - start;
    logStepDone("detect", durationMs);
    return { step: "detect", success: true, durationMs, outputPath: detectionPath };

  } catch (error) {
    logError("detect", error);
    return { step: "detect", success: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
  }
}
