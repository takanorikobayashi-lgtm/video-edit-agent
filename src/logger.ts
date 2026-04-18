import { PipelineStep } from "./types";

const COLORS: Record<string, string> = {
  extract: "\x1b[32m",
  analyze: "\x1b[33m",
  narrate: "\x1b[34m",
  render: "\x1b[35m",
  system: "\x1b[36m",
  error: "\x1b[31m",
  reset: "\x1b[0m",
};

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function log(step: string, message: string): void {
  const color = COLORS[step] ?? COLORS.system;
  const label = step.toUpperCase().slice(0, 10).padEnd(10);
  console.log(`${color}[${timestamp()}] [${label}]${COLORS.reset} ${message}`);
}

export function logStepStart(step: string): void {
  log(step, `━━━ Starting ${step} ━━━`);
}

export function logStepDone(step: string, durationMs: number): void {
  const sec = (durationMs / 1000).toFixed(1);
  log(step, `✓ Completed in ${sec}s`);
}

export function logError(step: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  log("error", `[${step}] ${msg}`);
}
