import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";
import type { PlanRequest, PlanResponse } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse<PlanResponse | { error: string }>> {
  try {
    const body = await req.json() as PlanRequest;
    const { sessionId, hearing, mode } = body;
    if (!sessionId || !hearing || !mode) return NextResponse.json({ error: "sessionId, hearing, mode が必要です" }, { status: 400 });

    const job = getJob(sessionId);
    if (!job) return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });

    const { buildPlan } = await import("@pipeline/skills/director");

    const hearingAnswers = {
      purpose: hearing.purpose as never,
      targetLength: hearing.targetLength,
      subtitles: { enabled: hearing.subtitles.enabled, style: hearing.subtitles.style as never },
      narration: hearing.narration,
      effects: { enabled: hearing.effects.enabled, types: hearing.effects.types as never[] },
    };

    const plan = buildPlan(hearingAnswers, mode as never);

    job.plan = plan;

    return NextResponse.json({ plan });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
