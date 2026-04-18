# Video Edit Agent — アーキテクチャ設計仕様

**作成日:** 2026-04-18  
**ステータス:** 承認済み  
**対象ブランチ:** feat/video-edit-agent-v2

---

## 1. 概要と目的

画面録画・ショート動画を入力として、ユーザーへのヒアリングを経て自動編集・書き出しを行うAIエージェントシステム。

**最重要ゴール:** ユーザーが抽象的な目的を持ってきたとき、ヒアリングで具体化し、承認を経て動画を完成させること。

**解決する問題:**
- 現在の `orchestrator.ts` は CLI + readline での簡易対話のみ
- Mode A / Mode B でrender処理が分岐しているが、ヒアリングが浅い
- tmp/ に古いデータが残り動画切り替え時に手動クリアが必要

**採用アーキテクチャ:** 案2 — Director Skill + Web UI（Gemini統一）

---

## 2. 技術スタック

| レイヤー | 技術 | 役割 |
|---|---|---|
| フロントエンド | Next.js (TypeScript) | ヒアリングUI・進捗表示・承認画面 |
| バックエンド | Next.js API Routes | REST + SSE（リアルタイム進捗） |
| AI | Gemini 2.5 Flash | 画面解析・音声書き起こし・TTS |
| 動画処理 | ffmpeg (ローカル) | フレーム抽出・カット・字幕焼き付け |
| 動画合成 | Remotion (ローカル) | Mode A エフェクト付き合成 |
| 言語 | TypeScript strict | 全コード |

---

## 3. システムアーキテクチャ

```
ユーザー
  ↕
Web UI (Next.js) — ヒアリング・進捗・承認の全画面
  ↕ REST API + SSE
director skill — オーケストレーション司令塔
  ↓ Skill呼び出し（production-plan.jsonに従う）
  ├── [Mode A] screen-analyzer → narrator
  ├── [Mode B] transcriber → silence-cutter
  └── [共通オプション] subtitler → effects-artist → renderer

共通インフラ: tmp/ | ffmpeg | Remotion | Gemini API | output/
```

### Web UI 画面遷移

```
① 動画アップロード
  → ② ヒアリング（4〜5ステップ選択式）
    → ③ 構成プレビュー確認【承認B】
      → ④ 各ステップ承認（ナレ文・字幕・カット）【承認C】
        → ⑤ 処理進捗（SSEリアルタイム）
          → ⑥ 完成・ダウンロード
```

---

## 4. ヒアリングフロー（director skill の核心）

動画アップ直後に Gemini Vision が1フレームを自動解析し、`screen` / `short` を判定してからヒアリング開始。

### Step 0: 自動モード判定（ユーザー操作不要）
- 1fps でフレーム抽出（先頭1枚）
- Gemini Vision で画面内容・音声有無を解析
- `screen` / `short` を自動判定（信頼度 < 80% の場合のみユーザーに確認）
- 動画の長さ・解像度をメタデータ取得

### Step 1: 動画の目的を選択

**Mode A（画面収録）:**
- 🖥 操作レクチャー解説動画
- 📊 プレゼン解説動画
- 🛠 サービス・ツール解説動画

**Mode B（ショート動画）:**
- 📱 TikTok / ショート
- 🎥 Vlog / 日常
- 🛍 プロモーション / 商品紹介

### Step 2: 完成動画の長さを選択
選択肢: 30秒 / 1分 / 3分 / 5分 / 10分  
**制限ロジック:** `完成尺 ≤ 元動画時間 × 0.9` を超える選択肢は非表示

### Step 3: 字幕 あり / なし → スタイル選択
Yes の場合のスタイル選択肢:
- シンプル白文字（黒アウトライン）
- 黄色ボックス
- グラデーション背景
- 半透明黒帯

### Step 4: エフェクト あり / なし → タイプ選択（複数可）
- zoomIn / zoomOut / panLeft / panRight  
- ※ Mode A のみ追加: ナレーション あり / なし

### Step 5: 制作プレビュー確認【承認B + C】

**承認B（タイムライン構成案）:**
- カラーバーでセグメント／カット区間を視覚化
- 「この構成で進む」または「修正する」

**承認C（ステップ別テキスト確認）:**
1. ナレーション文を確認・修正（Mode A のみ）
2. 字幕テキストを確認・修正
3. カット区間を確認・調整
→ すべて承認後にレンダリング開始

---

## 5. Skills 定義（8専門エージェント）

### 共通 Skills

#### `director`
- **責務:** ヒアリング実施・制作プラン生成・全Skillの呼び出し順序管理・承認ゲート制御・エラーリカバリー・tmp/自動クリア
- **入力:** `input/*.mp4`, `detection.json`, ヒアリング回答（Web UI）
- **出力:** `tmp/production-plan.json`, 承認ゲートイベント（SSE）, 進捗ストリーム（SSE）
- **API:** Gemini Vision（モード判定）
- **エラー:** Skill失敗 → 3回リトライ → スキップしてログ

`production-plan.json` の構造:
```json
{
  "mode": "screen | short",
  "purpose": "tutorial | tiktok | vlog | promo | lecture",
  "targetLength": 180,
  "subtitles": { "enabled": true, "style": "simple-white" },
  "effects": { "enabled": true, "types": ["zoomIn", "panRight"] },
  "narration": true,
  "skillSequence": ["screen-analyzer", "narrator", "subtitler", "effects-artist", "renderer"],
  "approvalGates": ["timeline", "narration-text", "subtitle-text", "cut-list"]
}
```

#### `renderer`
- **責務:** 最終レンダリング。Mode A: Remotion合成（→ ffmpegフォールバック）。Mode B: ffmpegカット＋字幕焼き付け
- **入力(A):** `tmp/frames/`, `tmp/audio/`, `tmp/render-props.json`
- **入力(B):** `input/*.mp4`, `tmp/cut-list.json`, `tmp/subtitles-styled.srt`
- **出力:** `output/<name>_<timestamp>.mp4`

### Mode A 専用 Skills

#### `screen-analyzer`
- **責務:** フレームをGemini Visionでバッチ解析。操作内容認識・ナレーション文生成・カット区間判定
- **入力:** `tmp/frames/*.png`, `tmp/metadata.json`, `production-plan.json`（purpose, targetLength）
- **出力:** `tmp/script.json`（segments[], cuts[]）
- **API:** Gemini 2.5 Flash Vision（バッチ最大20枚/req、バッチ間2枚オーバーラップ）
- **カット判定:** SSIM閾値0.98・3秒以上変化なし → keep: false
- **プロンプト:** purpose によって解説スタイルを変更（チュートリアル／プレゼン／サービス紹介）

#### `narrator`
- **責務:** script.json のナレーション文をGemini TTSでセグメントごとにMP3生成
- **入力:** `tmp/script.json`, `production-plan.json`（narration: true のみ実行）
- **出力:** `tmp/audio/segment-NNNN.mp3`, `tmp/audio/manifest.json`
- **API:** Gemini 2.5 Flash TTS（voice: Kore）
- **並列制御:** 3リクエスト並列 / 429時 exponential backoff
- **音声 > 映像:** 音声が長い場合は映像側フレーム表示時間を延長

### Mode B 専用 Skills

#### `transcriber`
- **責務:** 元動画の音声をGemini Audioで書き起こし。字幕エントリ生成・SRT出力
- **入力:** `input/*.mp4`（音声トラック）
- **出力:** `tmp/subtitles.json`, `tmp/subtitles.srt`, `tmp/audio/original.mp3`
- **API:** Gemini Audio
- **出力形式:** 1字幕 ≈ 2〜4秒分の発話、タイムスタンプ: 秒（小数点2桁）

#### `silence-cutter`
- **責務:** 無音区間（あー・えー・間）をffmpegで検出してカットリスト生成
- **入力:** `input/*.mp4`, `production-plan.json`（targetLength）
- **出力:** `tmp/cut-list.json`（cuts[]{startTime, endTime, reason}）
- **処理:** ffmpeg silencedetect（noise=-30dB, duration=0.8秒）、ローカル処理
- **targetLength調整:** 超過する場合は長い無音区間から優先カット

### 共通オプション Skills

#### `subtitler`
- **責務:** 字幕テキスト取得・スタイル適用・承認C用テキスト一覧提供・ffmpegで焼き付け
- **入力(A):** `tmp/script.json`（narrationフィールド — ナレーションOFF時も字幕用テキストとして使用）
- **入力(B):** `tmp/subtitles.srt`
- **出力:** `tmp/subtitles-styled.srt`, 承認C用字幕テキスト一覧（Web UI）
- **処理:** ffmpeg subtitles filter（libass）/ libass未対応時は mov_text ソフト字幕にフォールバック

#### `effects-artist`
- **責務:** Remotionコンポジションにエフェクトパラメータを設定。APIコスト $0
- **対応モード:** **Mode A のみ**（Mode B は ffmpeg レンダリングのためRemotionエフェクト非対応）
- **入力:** `tmp/render-props.json`, `production-plan.json`（effectTypes[]）
- **出力:** `tmp/render-props.json`（effects追記）
- **エフェクト種別:** zoomIn / zoomOut / panLeft / panRight / クロスフェード0.3秒
- **処理:** Remotion SegmentScene.tsx（ローカル）
- **Mode B でエフェクト選択時:** ヒアリング Step 4 にて「エフェクトは画面収録モードのみ対応」と案内し選択不可にする

---

## 6. コスト概算（Gemini 2.5 Flash）

| | Mode A 3分（ナレあり） | Mode A 3分（ナレなし） | Mode B 3分 |
|---|---|---|---|
| 画面解析 / 書き起こし | $0.018 | $0.018 | $0.006 |
| TTS（ナレーション） | $0.019 | — | — |
| Director ヒアリング | $0.001 | $0.001 | $0.001 |
| **合計** | **~$0.038** | **~$0.019** | **~$0.007** |

月100本制作: Mode A ≈ **$3.8/月** / Mode B ≈ **$0.7/月**  
旧スタック（Claude + ElevenLabs）比: **約62%コスト削減**

エフェクト・カット編集・字幕: **$0**（ローカル処理）

---

## 7. ファイル構成（実装後）

```
video-edit-agent/
├── src/
│   ├── skills/                    # 新規（既存ファイルを再配置）
│   │   ├── director.ts            # 新規
│   │   ├── screen-analyzer.ts     # ← 02-analyze.ts
│   │   ├── narrator.ts            # ← 03-narrate.ts
│   │   ├── transcriber.ts         # ← 02b-transcribe.ts
│   │   ├── silence-cutter.ts      # 新規
│   │   ├── subtitler.ts           # 新規（既存コードから字幕部分を抽出）
│   │   ├── effects-artist.ts      # 新規
│   │   └── renderer.ts            # ← 04-render.ts
│   ├── production-plan.ts         # 新規（ProductionPlan型定義）
│   ├── orchestrator.ts            # 既存（Web UI対応に更新）
│   ├── types.ts                   # 既存（ProductionPlan型追加）
│   └── ...（既存ファイル）
├── web/                           # 新規（Next.js）
│   ├── app/
│   │   ├── page.tsx               # アップロード画面
│   │   ├── hearing/page.tsx       # ヒアリング画面（Step 1〜4）
│   │   ├── preview/page.tsx       # 構成プレビュー（承認B）
│   │   ├── approve/page.tsx       # ステップ承認（承認C）
│   │   ├── progress/page.tsx      # 進捗（SSE）
│   │   └── api/
│   │       ├── upload/route.ts    # 動画アップロード
│   │       ├── detect/route.ts    # モード自動判定
│   │       ├── plan/route.ts      # 制作プラン生成
│   │       ├── run/route.ts       # パイプライン実行
│   │       └── events/route.ts    # SSE（進捗・承認ゲート）
│   └── ...（Next.js設定）
├── remotion/                      # 既存
├── tmp/                           # 中間ファイル（パイプライン開始時自動クリア）
├── output/                        # 完成動画
└── input/                         # 入力動画
```

---

## 8. データフロー

### Mode A（画面収録）
```
input/*.mp4
  → [01-extract]      tmp/frames/*.png + tmp/metadata.json
  → [screen-analyzer] tmp/script.json
  → [narrator]        tmp/audio/*.mp3 + tmp/audio/manifest.json
  → [subtitler]       tmp/subtitles-styled.srt          ← 字幕オプション時のみ
  → [effects-artist]  tmp/render-props.json（effects追記） ← エフェクトオプション時のみ
  → [renderer]        output/<name>_<timestamp>.mp4
```

### Mode B（ショート動画）
```
input/*.mp4
  → [01-extract]      tmp/frames/*.png + tmp/metadata.json
  → [transcriber]     tmp/subtitles.json + tmp/subtitles.srt + tmp/audio/original.mp3
  → [silence-cutter]  tmp/cut-list.json
  → [subtitler]       tmp/subtitles-styled.srt          ← 字幕オプション時のみ
  → [effects-artist]  tmp/render-props.json              ← エフェクトオプション時のみ
  → [renderer]        output/<name>_<timestamp>.mp4
```

---

## 9. エラーハンドリング方針

- 各Skill: 最大3回リトライ → 失敗時はスキップしてログ出力（既存方針を維持）
- director: Skill失敗を Web UI の進捗画面にSSEで通知
- ファイル不存在: 早期エラーで分かりやすいメッセージを返す
- 承認タイムアウト: ユーザーが30分以内に承認しない場合はセッションを保持（tmp/は消さない）

---

## 10. 検証方法

1. **ヒアリングフロー:** Web UIで動画アップ → 5ステップ回答 → production-plan.json が正しく生成されるか
2. **Mode A E2E:** `input/recording.mp4` → ヒアリング → 承認 → `output/*.mp4`（ナレーション・字幕付き）
3. **Mode B E2E:** `input/videoplayback.mp4` → ヒアリング → 承認 → `output/*.mp4`（字幕焼き付け）
4. **コスト確認:** Gemini API コンソールで実際のトークン使用量を確認
5. **承認ゲート:** 承認Cでナレーション文を修正 → 修正が反映された動画が生成されるか
