import { NextRequest, NextResponse } from "next/server";
import { getJob, emitProgress } from "@/lib/job-store";
import { buildPipelineConfig } from "@/lib/pipeline";
import type { RunRequest } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse<{ started: boolean } | { error: string }>> {
  try {
    const { sessionId } = await req.json() as RunRequest;
    if (!sessionId) return NextResponse.json({ error: "sessionId が必要です" }, { status: 400 });

    const job = getJob(sessionId);
    if (!job) return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
    if (!job.plan) return NextResponse.json({ error: "先に /api/plan を呼んでプランを生成してください" }, { status: 400 });

    const config = buildPipelineConfig(job.inputFile);
    const plan = job.plan as never;

    setImmediate(async () => {
      try {
        const { execute } = await import("@pipeline/skills/director");

        await execute(plan, config, (skillName, result) => {
          emitProgress(sessionId, {
            type: result.success ? "skill_done" : "skill_error",
            skillName,
            success: result.success,
            durationMs: result.durationMs,
            outputPath: result.outputPath,
            error: result.error,
          });
        });

        const outputPath = job.outputPath ?? config.outputDir;
        emitProgress(sessionId, { type: "pipeline_done", outputPath });
      } catch (err) {
        emitProgress(sessionId, { type: "pipeline_error", error: String(err) });
      }
    });

    return NextResponse.json({ started: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
