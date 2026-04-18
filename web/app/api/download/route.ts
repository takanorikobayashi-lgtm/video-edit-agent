import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { OUTPUT_DIR } from "@/lib/pipeline";

export async function GET(req: NextRequest): Promise<Response> {
  const filename = req.nextUrl.searchParams.get("file");
  if (!filename) return new Response("Missing file param", { status: 400 });

  // パストラバーサル対策: basename のみ使用
  const safeName = path.basename(filename);
  const filePath = path.join(OUTPUT_DIR, safeName);

  if (!fs.existsSync(filePath)) return new Response("File not found", { status: 404 });

  const buffer = fs.readFileSync(filePath);
  return new Response(buffer, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
