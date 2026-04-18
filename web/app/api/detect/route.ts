import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import type { DetectResponse } from "@/lib/types";
import { buildPipelineConfig } from "@/lib/pipeline";
import { getJob, createJob } from "@/lib/job-store";

async function runDetect(config: ReturnType<typeof buildPipelineConfig>) {
  const { detect } = await import("@pipeline/00-detect");
  return detect(config);
}

function readDetection(tmpDir: string) {
  const p = path.join(tmpDir, "detection.json");
  if (!fs.existsSync(p)) throw new Error("detection.json が生成されませんでした");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readMetadata(tmpDir: string) {
  const p = path.join(tmpDir, "metadata.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export async function POST(req: NextRequest): Promise<NextResponse<DetectResponse | { error: string }>> {
  try {
    const { sessionId, inputFile } = await req.json() as { sessionId: string; inputFile: string };
    if (!sessionId || !inputFile) return NextResponse.json({ error: "sessionId と inputFile が必要です" }, { status: 400 });

    if (!fs.existsSync(inputFile)) return NextResponse.json({ error: `ファイルが見つかりません: ${inputFile}` }, { status: 400 });

    if (!getJob(sessionId)) createJob(sessionId, inputFile);

    const config = buildPipelineConfig(inputFile);

    if (fs.existsSync(config.tmpDir)) {
      for (const e of fs.readdirSync(config.tmpDir)) {
        fs.rmSync(path.join(config.tmpDir, e), { recursive: true, force: true });
      }
    }
    fs.mkdirSync(config.tmpDir, { recursive: true });

    const result = await runDetect(config);
    if (!result.success) return NextResponse.json({ error: result.error ?? "モード判定失敗" }, { status: 500 });

    const detection = readDetection(config.tmpDir);
    const metadata = readMetadata(config.tmpDir);

    const mode: "screen" | "short" = detection.modeConfig?.mode ?? "screen";
    const confidence = Math.round((detection.detection?.confidence ?? 0.9) * 100);
    const duration: number = metadata?.duration ?? 0;

    return NextResponse.json({ sessionId, mode, duration, confidence });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
