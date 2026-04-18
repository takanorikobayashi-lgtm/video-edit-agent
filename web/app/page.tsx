"use client";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type Stage = "idle" | "uploading" | "detecting" | "error";

export default function UploadPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setErrorMsg("動画ファイルを選択してください");
      setStage("error");
      return;
    }

    try {
      setStage("uploading");
      const form = new FormData();
      form.append("video", file);
      const upRes = await fetch("/api/upload", { method: "POST", body: form });
      if (!upRes.ok) throw new Error(await upRes.text());
      const { sessionId, inputFile } = await upRes.json();

      setStage("detecting");
      const detRes = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, inputFile }),
      });
      if (!detRes.ok) throw new Error(await detRes.text());
      const { mode, duration, confidence } = await detRes.json();

      router.push(
        `/hearing?sessionId=${sessionId}&mode=${mode}&duration=${duration}&confidence=${confidence}`
      );
    } catch (err) {
      setErrorMsg(String(err));
      setStage("error");
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const label = stage === "uploading" ? "アップロード中..." : stage === "detecting" ? "動画を解析中..." : "動画をドラッグ＆ドロップ";

  return (
    <div className="flex flex-col items-center gap-8 mt-16">
      <h1 className="text-2xl font-bold">動画をアップロード</h1>
      <div
        onClick={() => stage === "idle" && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className="w-full max-w-xl border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors"
        style={{
          borderColor: drag ? "var(--accent)" : "var(--border)",
          background: drag ? "rgba(31,111,235,0.05)" : "var(--surface)",
        }}
      >
        <div className="text-5xl mb-4">📤</div>
        <p className="text-lg" style={{ color: stage === "idle" ? "var(--text)" : "var(--accent)" }}>
          {label}
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>MP4, MOV, AVI 対応</p>
      </div>

      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onFileChange} />

      {stage === "error" && (
        <div className="w-full max-w-xl rounded-lg p-4 text-sm" style={{ background: "rgba(218,54,51,0.1)", color: "#f85149", border: "1px solid var(--error)" }}>
          ❌ {errorMsg}
          <button className="ml-4 underline" onClick={() => setStage("idle")}>再試行</button>
        </div>
      )}

      {(stage === "uploading" || stage === "detecting") && (
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-muted)" }}>
          <span className="animate-spin">⟳</span>
          {stage === "uploading" ? "ファイルを保存中..." : "Gemini で動画を解析中..."}
        </div>
      )}
    </div>
  );
}
