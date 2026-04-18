# Video Edit Agent

画面録画から解説付きチュートリアル動画を自動生成するClaude Codeエージェント。

## Project Overview

- **目的**: 画面操作の録画→解析→ナレーション→動画化を自動パイプラインで実行
- **Stack**: TypeScript, ffmpeg, Claude API (Vision), ElevenLabs API, Remotion
- **実行**: `npx ts-node src/orchestrator.ts --input input/recording.mp4`

## Architecture

```
input/recording.mp4
  → 01-extract (ffmpeg)     → tmp/frames/*.png + tmp/metadata.json
  → 02-analyze  (Claude Vision) → tmp/script.json
  → 03-narrate  (ElevenLabs)    → tmp/audio/*.mp3 + tmp/audio/manifest.json
  → 04-render   (Remotion)      → output/final.mp4
```

各ステップの出力は `tmp/` に保存し、次ステップへの入力となる。
ステップ単独の再実行: `npx ts-node src/orchestrator.ts --step analyze`

## Pipeline Rules

### 01-extract（フレーム抽出）
- ffmpegで1fps（1秒1枚）でPNG抽出。`--fps` オプションで変更可能
- 出力: `tmp/frames/frame-NNNNNN.png`（6桁ゼロ埋め連番）
- メタデータ: `tmp/metadata.json` に総フレーム数・解像度・fps・duration記録

### 02-analyze（画面解析）
- Claude Vision APIにフレームをバッチ送信（最大20枚/リクエスト）
- 前後のコンテキストを維持するため、バッチ間で最後の2枚をオーバーラップ
- 各フレームに対し: 操作内容の認識 → 解説テキスト生成 → 不要区間判定
- カット判定基準: 3秒以上画面変化なし（SSIM > 0.98）→ 不要区間マーク
- 出力: `tmp/script.json`

```json
{
  "segments": [
    {
      "id": 1,
      "startFrame": 0,
      "endFrame": 15,
      "startTime": 0.0,
      "endTime": 15.0,
      "narration": "まず、ブラウザでShopifyの管理画面を開きます",
      "action": "ブラウザ起動→Shopify管理画面へアクセス",
      "keep": true
    }
  ],
  "cuts": [
    { "startTime": 15.0, "endTime": 22.0, "reason": "ページ読み込み待ち" }
  ]
}
```

### 03-narrate（音声生成）
- ElevenLabs APIでセグメントごとにMP3生成
- レート制限対応: 並列3リクエスト、429時はexponential backoff
- 各MP3のdurationを取得し `tmp/audio/manifest.json` に記録
- 音声が映像より長い場合→映像側のフレーム表示時間を延長

### 04-render（動画レンダリング）
- Remotionコンポジションで映像+音声+テロップを合成
- `script.json` の `keep: false` セグメントはスキップ
- トランジション: カット間にクロスフェード（0.3秒）
- テロップ: 画面下部に白文字・半透明黒背景
- 出力: `output/final.mp4`（1080p, 30fps）

## Development Standards

- TypeScript strict mode
- エラー時は最大3回リトライ、それでも失敗したらそのセグメントをスキップしてログ出力
- 環境変数: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` を `.env` から読み込み
- ログ: 各ステップの開始・完了・所要時間をconsole.logで出力
- テスト実行: `npx vitest run`

## File Naming

- ソースコード: kebab-case (`frame-extractor.ts`)
- 型定義: PascalCase (`ScriptSegment`, `AudioManifest`)
- 定数: SCREAMING_SNAKE_CASE (`MAX_BATCH_SIZE`)

## Key Constraints

- Claude Vision API: 1リクエストあたり画像20枚上限。超える場合はバッチ分割
- ElevenLabs: 無料枠は月10,000文字。本番はPro以上推奨
- Remotion: `npx remotion render` でheadless実行。CI対応
- ffmpegはローカルインストール前提（`which ffmpeg` で確認）

## Reference Docs

- @docs/script-schema.md — script.jsonの詳細スキーマ定義
- @docs/remotion-setup.md — Remotionプロジェクト初期設定手順
- @docs/troubleshooting.md — よくあるエラーと対処法
