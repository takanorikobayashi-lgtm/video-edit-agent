import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { INPUT_DIR } from "@/lib/pipeline";
import type { UploadResponse } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse<UploadResponse | { error: string }>> {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;
    if (!file) return NextResponse.json({ error: "動画ファイルが必要です" }, { status: 400 });

    const ext = path.extname(file.name) || ".mp4";
    const sessionId = randomUUID();
    const filename = `upload_${sessionId}${ext}`;

    fs.mkdirSync(INPUT_DIR, { recursive: true });
    const inputFile = path.join(INPUT_DIR, filename);

    const bytes = await file.arrayBuffer();
    fs.writeFileSync(inputFile, Buffer.from(bytes));

    return NextResponse.json({ sessionId, inputFile, filename });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
