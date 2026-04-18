"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { SSEEvent } from "@/lib/types";

interface SkillStatus {
  name: string;
  status: "pending" | "running" | "done" | "error";
  durationMs?: number;
  error?: string;
}

const SKILL_LABELS: Record<string, string> = {
  extract: "📂 フレーム抽出",
  "screen-analyzer": "🔍 画面解析",
  narrator: "🎤 ナレーション生成",
  transcriber: "📝 音声書き起こし",
  "silence-cutter": "✂️ 無音カット",
  subtitler: "💬 字幕生成",
  "effects-artist": "✨ エフェクト設定",
  renderer: "🎬 動画レンダリング",
};

function ProgressInner() {
  const params = useSearchParams();
  const sessionId = params.get("sessionId") ?? "";

  const [skills, setSkills] = useState<SkillStatus[]>([]);
  const [done, setDone] = useState(false);
  const [outputPath, setOutputPath] = useState("");
  const [pipelineError, setPipelineError] = useState("");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(`/api/events?sessionId=${sessionId}`);
    esRef.current = es;

    es.onmessage = (e) => {
      const event: SSEEvent = JSON.parse(e.data);

      if (event.type === "skill_start" && event.skillName) {
        setSkills((prev) => {
          const exists = prev.find((s) => s.name === event.skillName);
          if (exists) return prev.map((s) => s.name === event.skillName ? { ...s, status: "running" } : s);
          return [...prev, { name: event.skillName!, status: "running" }];
        });
      }

      if ((event.type === "skill_done" || event.type === "skill_error") && event.skillName) {
        setSkills((prev) => {
          const exists = prev.find((s) => s.name === event.skillName);
          const updated = prev.map((s) =>
            s.name === event.skillName
              ? { ...s, status: (event.success ? "done" : "error") as SkillStatus["status"], durationMs: event.durationMs, error: event.error }
              : s
          );
          if (!exists) {
            return [...updated, { name: event.skillName!, status: event.success ? "done" : "error", durationMs: event.durationMs, error: event.error }];
          }
          return updated;
        });
      }

      if (event.type === "pipeline_done") {
        setDone(true);
        setOutputPath(event.outputPath ?? "");
        es.close();
      }

      if (event.type === "pipeline_error") {
        setPipelineError(event.error ?? "不明なエラー");
        es.close();
      }
    };

    es.onerror = () => {
      if (!done) setPipelineError("SSE接続が切断されました");
      es.close();
    };

    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const outputFilename = outputPath ? outputPath.split("/").pop() : "";

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">⏳ 動画を編集中...</h1>

      {/* Skill progress list */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        {skills.length === 0 && !done && !pipelineError && (
          <div className="p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            <span className="animate-spin inline-block mr-2">⟳</span> パイプラインを起動中...
          </div>
        )}
        {skills.map((skill, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4" style={{ borderBottom: i < skills.length - 1 ? `1px solid var(--border)` : undefined, background: "var(--surface)" }}>
            <span className="text-xl">
              {skill.status === "done" ? "✅" : skill.status === "error" ? "❌" : skill.status === "running" ? "⟳" : "⬜"}
            </span>
            <div className="flex-1">
              <p className="font-medium text-sm">{SKILL_LABELS[skill.name] ?? skill.name}</p>
              {skill.error && <p className="text-xs mt-1" style={{ color: "var(--error)" }}>{skill.error}</p>}
            </div>
            {skill.durationMs != null && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{(skill.durationMs / 1000).toFixed(1)}s</span>
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {pipelineError && (
        <div className="rounded-lg p-4 text-sm" style={{ background: "rgba(218,54,51,0.1)", color: "#f85149", border: "1px solid var(--error)" }}>
          ❌ パイプラインエラー: {pipelineError}
        </div>
      )}

      {/* Done: download */}
      {done && (
        <div className="rounded-xl p-6 flex flex-col items-center gap-4" style={{ background: "rgba(35,134,54,0.1)", border: "1px solid var(--success)" }}>
          <p className="text-xl font-bold" style={{ color: "#56d364" }}>✅ 動画の編集が完了しました！</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{outputFilename}</p>
          <a
            href={`/api/download?file=${encodeURIComponent(outputFilename ?? "")}`}
            download
            className="px-8 py-3 rounded-lg font-bold text-sm"
            style={{ background: "var(--success)", color: "white" }}
          >
            ⬇ 動画をダウンロード
          </a>
          <a href="/" className="text-sm underline" style={{ color: "var(--text-muted)" }}>
            別の動画を編集する
          </a>
        </div>
      )}
    </div>
  );
}

export default function ProgressPage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <ProgressInner />
    </Suspense>
  );
}
