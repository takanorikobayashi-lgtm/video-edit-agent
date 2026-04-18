import { EventEmitter } from "events";
import type { SSEEvent } from "./types";

export interface Job {
  sessionId: string;
  emitter: EventEmitter;
  status: "running" | "done" | "error";
  inputFile: string;
  outputPath?: string;
  error?: string;
  plan?: object;
}

// プロセス内シングルトン（ローカルツール用）
const jobs = new Map<string, Job>();

export function createJob(sessionId: string, inputFile: string): Job {
  const job: Job = {
    sessionId,
    emitter: new EventEmitter(),
    status: "running",
    inputFile,
  };
  jobs.set(sessionId, job);
  return job;
}

export function getJob(sessionId: string): Job | undefined {
  return jobs.get(sessionId);
}

export function emitProgress(sessionId: string, event: SSEEvent): void {
  const job = jobs.get(sessionId);
  if (!job) return;
  job.emitter.emit("event", event);
  if (event.type === "pipeline_done") {
    job.status = "done";
    job.outputPath = event.outputPath;
    job.emitter.emit("done");
  }
  if (event.type === "pipeline_error") {
    job.status = "error";
    job.error = event.error;
    job.emitter.emit("done");
  }
}
