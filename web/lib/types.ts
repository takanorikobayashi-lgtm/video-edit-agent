// /api/upload レスポンス
export interface UploadResponse {
  sessionId: string;
  inputFile: string;   // 保存先絶対パス
  filename: string;
}

// /api/detect レスポンス
export interface DetectResponse {
  sessionId: string;
  mode: "screen" | "short";
  duration: number;     // 秒
  confidence: number;   // 0-100
}

// /api/plan リクエスト
export interface PlanRequest {
  sessionId: string;
  hearing: {
    purpose: string;
    targetLength: number;
    subtitles: { enabled: boolean; style: string };
    narration: boolean;
    effects: { enabled: boolean; types: string[] };
  };
  mode: "screen" | "short";
}

// /api/plan レスポンス
export interface PlanResponse {
  plan: {
    mode: string;
    purpose: string;
    targetLength: number;
    subtitles: { enabled: boolean; style: string };
    narration: boolean;
    effects: { enabled: boolean; types: string[] };
    skillSequence: string[];
    approvalGates: string[];
  };
}

// /api/run リクエスト
export interface RunRequest {
  sessionId: string;
}

// SSE イベント (events route から送信)
export interface SSEEvent {
  type: "skill_start" | "skill_done" | "skill_error" | "pipeline_done" | "pipeline_error";
  skillName?: string;
  success?: boolean;
  durationMs?: number;
  outputPath?: string;
  error?: string;
}
