import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const TMP_DIR = path.join(ROOT, "tmp");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function createSymlink(target: string, linkPath: string): void {
  if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) fs.unlinkSync(linkPath);
    else { console.log(`  ⚠ ${linkPath} は既存ディレクトリです`); return; }
  }
  fs.symlinkSync(target, linkPath, "dir");
  console.log(`  ✓ ${linkPath} → ${target}`);
}

function main(): void {
  console.log("\n🎬 Remotion セットアップ\n");
  ensureDir(PUBLIC_DIR);
  const framesTarget = path.join(TMP_DIR, "frames");
  const framesLink = path.join(PUBLIC_DIR, "frames");
  if (fs.existsSync(framesTarget)) createSymlink(framesTarget, framesLink);
  else console.log(`  ⚠ ${framesTarget} が見つかりません`);
  const audioTarget = path.join(TMP_DIR, "audio");
  const audioLink = path.join(PUBLIC_DIR, "audio");
  if (fs.existsSync(audioTarget)) createSymlink(audioTarget, audioLink);
  else console.log(`  ⚠ ${audioTarget} が見つかりません`);
  console.log("\n✓ セットアップ完了\n");
}

main();
