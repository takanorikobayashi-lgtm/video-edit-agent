#!/bin/bash
# ============================================================
# Video Edit Agent — GitHub リポジトリ初期化スクリプト
#
# 使い方:
#   chmod +x setup-github.sh
#   ./setup-github.sh
#
# 前提:
#   - git がインストール済み
#   - GitHub アカウントにログイン済み
#   - gh CLI がインストール済み (推奨) or 手動でリポ作成済み
# ============================================================

set -e

REPO_NAME="video-edit-agent"
GITHUB_USER="takaxai"
REPO_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Video Edit Agent — GitHub Setup                ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Git 初期化 ──
if [ ! -d ".git" ]; then
  echo "📁 Step 1: Initializing git repository..."
  git init
  echo "   ✓ git init 完了"
else
  echo "📁 Step 1: Git already initialized"
fi

# ── Step 2: 初期コミット ──
echo ""
echo "📝 Step 2: Creating initial commit..."
git add -A
git commit -m "🎬 Initial commit: Video Edit Agent

- Pipeline: extract → analyze → narrate → render
- Claude Vision API for screen analysis
- ElevenLabs TTS for narration
- Remotion for video composition with ffmpeg fallback
- CLI orchestrator with per-step execution" 2>/dev/null || echo "   (nothing to commit)"
echo "   ✓ 初期コミット完了"

# ── Step 3: GitHub リポジトリ作成 ──
echo ""
echo "🌐 Step 3: Creating GitHub repository..."

# gh CLI が使えるか確認
if command -v gh &> /dev/null; then
  echo "   gh CLI detected. Creating repo..."
  
  # gh でリポジトリ作成 (既に存在する場合はスキップ)
  if gh repo view "${GITHUB_USER}/${REPO_NAME}" &> /dev/null; then
    echo "   ⚠ Repository already exists: ${REPO_URL}"
  else
    gh repo create "${REPO_NAME}" \
      --public \
      --description "画面録画から解説付きチュートリアル動画を自動生成するClaude Codeエージェント" \
      --source . \
      --remote origin
    echo "   ✓ リポジトリ作成完了"
  fi
else
  echo "   ⚠ gh CLI が見つかりません"
  echo ""
  echo "   以下のいずれかの方法でリポジトリを作成してください:"
  echo ""
  echo "   方法A: gh CLI をインストール"
  echo "   ────────────────────────────"
  echo "   brew install gh      # macOS"
  echo "   gh auth login        # ログイン"
  echo "   ./setup-github.sh    # このスクリプトを再実行"
  echo ""
  echo "   方法B: GitHub Web から手動作成"
  echo "   ────────────────────────────"
  echo "   1. https://github.com/new にアクセス"
  echo "   2. Repository name: ${REPO_NAME}"
  echo "   3. Public を選択"
  echo "   4. 「Create repository」をクリック"
  echo "   5. 以下のコマンドを実行:"
  echo ""
  echo "   git remote add origin ${REPO_URL}"
  echo "   git branch -M main"
  echo "   git push -u origin main"
  echo ""
  exit 0
fi

# ── Step 4: Push ──
echo ""
echo "🚀 Step 4: Pushing to GitHub..."

# main ブランチに設定
git branch -M main

# remote が設定されていなければ追加
if ! git remote get-url origin &> /dev/null 2>&1; then
  git remote add origin "${REPO_URL}"
fi

git push -u origin main
echo "   ✓ Push 完了"

# ── 完了 ──
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ✓ セットアップ完了!"
echo ""
echo "  リポジトリ: https://github.com/${GITHUB_USER}/${REPO_NAME}"
echo ""
echo "  次のステップ:"
echo "  1. cp .env.example .env"
echo "  2. .env に API キーを設定"
echo "  3. npm install"
echo "  4. npm run dry-run で設定確認"
echo "  5. input/ に録画ファイルを配置"
echo "  6. npm run pipeline で実行!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
