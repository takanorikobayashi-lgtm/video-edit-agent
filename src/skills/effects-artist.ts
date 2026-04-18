import fs from "fs";
import path from "path";
import { PipelineConfig, ProductionPlan, StepResult } from "../types";
import { log, logStepStart, logStepDone, logError } from "../logger";

export async function run(config: PipelineConfig, plan: ProductionPlan): Promise<StepResult> {
  const start = Date.now();
  logStepStart("effects-artist");

  if (!plan.effects.enabled || plan.mode === "short") {
    log("effects-artist", "エフェクトなし — スキップ");
    return { step: "render" as any, success: true, durationMs: Date.now() - start };
  }

  try {
    const propsPath = path.join(config.tmpDir, "render-props.json");
    const props = fs.existsSync(propsPath)
      ? JSON.parse(fs.readFileSync(propsPath, "utf-8"))
      : {};

    props.effects = {
      enabled: true,
      types: plan.effects.types,
      transitionDuration: 0.3,
    };

    fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));
    log("effects-artist", `エフェクト設定: ${plan.effects.types.join(", ")}`);

    const durationMs = Date.now() - start;
    logStepDone("effects-artist", durationMs);
    return { step: "render" as any, success: true, durationMs, outputPath: propsPath };
  } catch (error) {
    logError("effects-artist", error);
    return { step: "render" as any, success: false, durationMs: Date.now() - start, error: error instanceof Error ? error.message : String(error) };
  }
}
