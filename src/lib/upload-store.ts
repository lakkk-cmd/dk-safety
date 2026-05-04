import { promises as fs } from "fs";
import path from "path";
import {
  SUPABASE_ENABLED,
  SUPABASE_UPLOAD_BUCKET,
  uploadBinaryObject
} from "@/lib/supabase-server";

const uploadsDir = path.join(process.cwd(), "public", "uploads");

function extFromFile(file: File): string {
  const fromName = path.extname(file.name || "").toLowerCase();
  if (fromName) return fromName;
  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  return ".jpg";
}

export async function saveImageFiles(files: File[], bucket: "reservations" | "emergency" | "worker-tasks") {
  if (files.length === 0) return [];

  const urls: string[] = [];
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileName = `${bucket}-${Date.now()}-${crypto.randomUUID()}${extFromFile(file)}`;
    if (SUPABASE_ENABLED) {
      const objectPath = `${bucket}/${fileName}`;
      const remoteUrl = await uploadBinaryObject({
        bucket: SUPABASE_UPLOAD_BUCKET,
        objectPath,
        contentType: file.type || "application/octet-stream",
        data: buffer
      });
      urls.push(remoteUrl);
    } else {
      await fs.mkdir(path.join(uploadsDir, bucket), { recursive: true });
      const absPath = path.join(uploadsDir, bucket, fileName);
      await fs.writeFile(absPath, buffer);
      urls.push(`/uploads/${bucket}/${fileName}`);
    }
  }
  return urls;
}
