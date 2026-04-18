"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const SKILL_COLORS: Record<string, string> = {
  extract: "#388bfd",
  "screen-analyzer": "#a5d6a7",
  narrator: "#ce93d8",
  transcriber: "#80cbc4",
  "silence-cutter": "#ef9a9a",
  subtitler: "#fff176",
  "effects-artist": "#ffcc02",
  renderer: "#4caf50",
};

const SKILL_LABELS: Record<string, string> = {
  extract: "フレーム抽出",
  "screen-analyzer": "画面解析",
  narrator: "ナレーション生成",
  transcriber: "音声書き起こし",
  "silence-cutter": "無音カット",
  subtitler: "字幕生成",
  "effects-artist": "エフェクト設定",
  renderer: "動画レンダリング",
};

function PreviewInner() {
  const params = useSearchParams();
  const sessionId = params.get("sessionId") ?? "";
  const planStr = params.get("plan") ?? "{}";
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  let plan: { skillSequence?: string[]; mode?: string; purpose?: string; targetLength?: number; narration?: boolean; subtitles?: { enabled: boolean; style: string }; effects?: { enabled: boolean; types: string[] } } = {};
  try { plan = JSON.parse(decodeURIComponent(planStr)); } catch {}

  const skills = plan.skillSequence ?? [];

  async function startRendering() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/progress?sessionId=${sessionId}&total=${skills.length}`);
    } catch (err) {
      setError(String(err));
      setStarting(false);
    }
  }

  const summary = [
    plan.mode === "screen" ? "📹 画面収録" : "🎬 ショート動画",
    `⏱ ${(plan.targetLength ?? 0) < 60 ? `${plan.targetLength}秒` : `${(plan.targetLength ?? 0) / 60}分`}`,
    plan.subtitles?.enabled ? `💬 字幕(${plan.subtitles.style})` : "字幕なし",
    plan.narration ? "🎤 ナレーションあり" : null,
    plan.effects?.enabled ? `✨ エフェクト(${plan.effects.types.join(",")})` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">📋 制作プレビュー確認</h1>

      {/* Summary */}
      <div className="rounded-xl p-4 flex flex-wrap gap-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        {summary.map((s, i) => (
          <span key={i} className="px-3 py-1 rounded-full text-sm" style={{ background: "rgba(56,139,253,0.1)", border: "1px solid var(--accent)", color: "var(--accent)" }}>{s}</span>
        ))}
      </div>

      {/* Timeline visualization */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h2 className="font-bold mb-4">実行スキルシーケンス</h2>
        <div className="flex gap-2 flex-wrap">
          {skills.map((skill, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="px-3 py-2 rounded-lg text-xs font-bold"
                style={{ background: `${SKILL_COLORS[skill] ?? "#888"}20`, border: `1px solid ${SKILL_COLORS[skill] ?? "#888"}`, color: SKILL_COLORS[skill] ?? "#888" }}
              >
                {SKILL_LABELS[skill] ?? skill}
              </div>
              {i < skills.length - 1 && <span style={{ color: "var(--text-muted)" }}>→</span>}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--error)" }}>❌ {error}</p>}

      <div className="flex justify-between">
        <button
          onClick={() => router.back()}
          className="px-6 py-2 rounded-lg text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          ← ヒアリングに戻る
        </button>
        <button
          onClick={startRendering}
          disabled={starting}
          className="px-8 py-3 rounded-lg font-bold text-sm"
          style={{ background: starting ? "var(--border)" : "var(--success)", color: "white" }}
        >
          {starting ? "開始中..." : "🎬 この構成で編集開始"}
        </button>
      </div>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <PreviewInner />
    </Suspense>
  );
}
