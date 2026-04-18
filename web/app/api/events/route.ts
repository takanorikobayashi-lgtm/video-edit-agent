import { NextRequest } from "next/server";
import { getJob } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return new Response("Missing sessionId", { status: 400 });

  const job = getJob(sessionId);
  if (!job) return new Response("Job not found", { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      if (job.status === "done") {
        send({ type: "pipeline_done", outputPath: job.outputPath });
        controller.close();
        return;
      }
      if (job.status === "error") {
        send({ type: "pipeline_error", error: job.error });
        controller.close();
        return;
      }

      const onEvent = (event: object) => send(event);
      const onDone = () => {
        job.emitter.off("event", onEvent);
        controller.close();
      };

      job.emitter.on("event", onEvent);
      job.emitter.once("done", onDone);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
