"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

type SubtitleStyle = "simple-white" | "yellow-box" | "gradient" | "semi-black";
type EffectType = "zoomIn" | "zoomOut" | "panLeft" | "panRight";

interface HearingState {
  purpose: string;
  targetLength: number;
  subtitles: { enabled: boolean; style: SubtitleStyle };
  narration: boolean;
  effects: { enabled: boolean; types: EffectType[] };
}

const SUBTITLE_STYLES: { id: SubtitleStyle; label: string }[] = [
  { id: "simple-white", label: "シンプル白文字" },
  { id: "yellow-box", label: "黄色ボックス" },
  { id: "gradient", label: "グラデーション背景" },
  { id: "semi-black", label: "半透明黒帯" },
];

const EFFECT_TYPES: { id: EffectType; label: string }[] = [
  { id: "zoomIn", label: "🔍 ズームイン" },
  { id: "zoomOut", label: "🔎 ズームアウト" },
  { id: "panLeft", label: "⬅ パンレフト" },
  { id: "panRight", label: "➡ パンライト" },
];

function HearingInner() {
  const params = useSearchParams();
  const sessionId = params.get("sessionId") ?? "";
  const mode = (params.get("mode") ?? "screen") as "screen" | "short";
  const duration = parseFloat(params.get("duration") ?? "600");
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [hearing, setHearing] = useState<HearingState>({
    purpose: mode === "screen" ? "tutorial" : "tiktok",
    targetLength: 60,
    subtitles: { enabled: true, style: "simple-white" },
    narration: mode === "screen",
    effects: { enabled: false, types: [] },
  });

  const purposeOptionsScreen = [
    { id: "tutorial", label: "🖥 操作レクチャー解説動画" },
    { id: "presentation", label: "📊 プレゼン解説動画" },
    { id: "service", label: "🛠 サービス・ツール解説動画" },
  ];
  const purposeOptionsShort = [
    { id: "tiktok", label: "📱 TikTok / ショート" },
    { id: "vlog", label: "🎥 Vlog / 日常" },
    { id: "promo", label: "🛍 プロモーション / 商品紹介" },
  ];
  const purposeOptions = mode === "screen" ? purposeOptionsScreen : purposeOptionsShort;

  const allLengths = [30, 60, 180, 300, 600];
  const validLengths = allLengths.filter((l) => l <= duration * 0.9);
  const displayLengths = validLengths.length > 0 ? validLengths : [Math.floor(duration * 0.9)];

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, hearing, mode }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { plan } = await res.json();
      router.push(`/preview?sessionId=${sessionId}&plan=${encodeURIComponent(JSON.stringify(plan))}`);
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  }

  const Btn = ({ children, onClick, active = false }: { children: React.ReactNode; onClick: () => void; active?: boolean }) => (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm transition-colors"
      style={{
        background: active ? "var(--accent)" : "var(--surface)",
        color: active ? "white" : "var(--text)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
      }}
    >
      {children}
    </button>
  );

  const stepTitle = ["", "動画の目的", "完成動画の長さ", "字幕", "エフェクト / ナレーション"];

  return (
    <div className="flex flex-col gap-8">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: s <= step ? "var(--accent)" : "var(--surface)", color: "white", border: `1px solid ${s <= step ? "var(--accent)" : "var(--border)"}` }}
            >
              {s}
            </div>
            {s < 4 && <div className="w-8 h-px" style={{ background: s < step ? "var(--accent)" : "var(--border)" }} />}
          </div>
        ))}
        <span className="ml-2 text-sm" style={{ color: "var(--text-muted)" }}>{stepTitle[step]}</span>
      </div>

      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        {/* Step 1: Purpose */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-bold text-lg">🎯 動画の目的を選択</h2>
            <div className="flex flex-col gap-2">
              {purposeOptions.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setHearing((h) => ({ ...h, purpose: o.id }))}
                  className="text-left px-4 py-3 rounded-lg transition-colors"
                  style={{
                    background: hearing.purpose === o.id ? "rgba(31,111,235,0.15)" : "transparent",
                    border: `1px solid ${hearing.purpose === o.id ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Length */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-bold text-lg">⏱ 完成動画の長さ</h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>元動画: {Math.round(duration)}秒（選択肢は元動画の90%以下）</p>
            <div className="flex gap-3 flex-wrap">
              {displayLengths.map((l) => (
                <Btn key={l} active={hearing.targetLength === l} onClick={() => setHearing((h) => ({ ...h, targetLength: l }))}>
                  {l < 60 ? `${l}秒` : `${l / 60}分`}
                </Btn>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Subtitles */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-bold text-lg">💬 字幕</h2>
            <div className="flex gap-3">
              <Btn active={hearing.subtitles.enabled} onClick={() => setHearing((h) => ({ ...h, subtitles: { ...h.subtitles, enabled: true } }))}>あり</Btn>
              <Btn active={!hearing.subtitles.enabled} onClick={() => setHearing((h) => ({ ...h, subtitles: { ...h.subtitles, enabled: false } }))}>なし</Btn>
            </div>
            {hearing.subtitles.enabled && (
              <div className="flex gap-3 flex-wrap mt-2">
                {SUBTITLE_STYLES.map((s) => (
                  <Btn key={s.id} active={hearing.subtitles.style === s.id} onClick={() => setHearing((h) => ({ ...h, subtitles: { ...h.subtitles, style: s.id } }))}>
                    {s.label}
                  </Btn>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Effects + Narration */}
        {step === 4 && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="font-bold text-lg mb-3">✨ エフェクト</h2>
              <div className="flex gap-3 mb-3">
                <Btn active={hearing.effects.enabled} onClick={() => setHearing((h) => ({ ...h, effects: { ...h.effects, enabled: true } }))}>あり</Btn>
                <Btn active={!hearing.effects.enabled} onClick={() => setHearing((h) => ({ ...h, effects: { ...h.effects, enabled: false } }))}>なし</Btn>
              </div>
              {hearing.effects.enabled && mode === "screen" && (
                <div className="flex gap-3 flex-wrap">
                  {EFFECT_TYPES.map((e) => (
                    <Btn
                      key={e.id}
                      active={hearing.effects.types.includes(e.id)}
                      onClick={() => setHearing((h) => {
                        const types = h.effects.types.includes(e.id)
                          ? h.effects.types.filter((t) => t !== e.id)
                          : [...h.effects.types, e.id];
                        return { ...h, effects: { ...h.effects, types } };
                      })}
                    >
                      {e.label}
                    </Btn>
                  ))}
                </div>
              )}
              {hearing.effects.enabled && mode === "short" && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>エフェクトは画面収録モードのみ対応しています</p>
              )}
            </div>
            {mode === "screen" && (
              <div>
                <h2 className="font-bold text-lg mb-3">🎤 ナレーション（AI音声）</h2>
                <div className="flex gap-3">
                  <Btn active={hearing.narration} onClick={() => setHearing((h) => ({ ...h, narration: true }))}>あり</Btn>
                  <Btn active={!hearing.narration} onClick={() => setHearing((h) => ({ ...h, narration: false }))}>なし（字幕のみ）</Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm" style={{ color: "var(--error)" }}>❌ {error}</p>}

      <div className="flex justify-between">
        {step > 1
          ? <button onClick={() => setStep((s) => s - 1)} className="px-6 py-2 rounded-lg text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>← 戻る</button>
          : <div />
        }
        {step < 4
          ? <button onClick={() => setStep((s) => s + 1)} className="px-6 py-2 rounded-lg text-sm font-bold" style={{ background: "var(--accent)", color: "white" }}>次へ →</button>
          : <button onClick={submit} disabled={submitting} className="px-6 py-2 rounded-lg text-sm font-bold" style={{ background: submitting ? "var(--border)" : "var(--success)", color: "white" }}>
              {submitting ? "プランを作成中..." : "✓ この内容で進む"}
            </button>
        }
      </div>
    </div>
  );
}

export default function HearingPage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <HearingInner />
    </Suspense>
  );
}
