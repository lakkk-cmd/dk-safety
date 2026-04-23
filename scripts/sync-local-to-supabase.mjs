#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";

const cwd = process.cwd();
const dataDir = path.join(cwd, "data");
const uploadsDir = path.join(cwd, "public", "uploads");

const dataBucket = process.env.SUPABASE_DATA_BUCKET || "dk-safety-data";
const uploadBucket = process.env.SUPABASE_UPLOAD_BUCKET || "dk-safety-uploads";

async function loadEnvFile() {
  const envPath = path.join(cwd, ".env.local");
  let raw = "";
  try {
    raw = await fs.readFile(envPath, "utf-8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function required(value, name) {
  if (!value) {
    throw new Error(`필수 환경변수 누락: ${name}`);
  }
  return value;
}

function headers(contentType, upsert = true) {
  const key = required(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  const result = {
    apikey: key,
    Authorization: `Bearer ${key}`
  };
  if (contentType) {
    result["Content-Type"] = contentType;
  }
  if (upsert) {
    result["x-upsert"] = "true";
  }
  return result;
}

function encodeObjectPath(objectPath) {
  return objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function uploadJson(fileName) {
  const filePath = path.join(dataDir, fileName);
  const raw = await fs.readFile(filePath, "utf-8");
  const objectPath = fileName;
  const endpoint = `${required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/${dataBucket}/${encodeObjectPath(objectPath)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers("application/json"),
    body: raw
  });
  if (!response.ok) {
    throw new Error(`${fileName} 업로드 실패: ${response.status}`);
  }
  console.log(`- ${fileName} 업로드 완료`);
}

async function walkFiles(root) {
  const collected = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      collected.push(fullPath);
    }
  }
  await walk(root);
  return collected;
}

async function uploadImage(filePath) {
  const relativePath = path.relative(uploadsDir, filePath).replaceAll("\\", "/");
  const objectPath = relativePath;
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";

  const bytes = await fs.readFile(filePath);
  const endpoint = `${required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/${uploadBucket}/${encodeObjectPath(objectPath)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers(contentType),
    body: bytes
  });
  if (!response.ok) {
    throw new Error(`이미지 업로드 실패(${relativePath}): ${response.status}`);
  }
  console.log(`- 이미지 업로드 완료: ${relativePath}`);
}

async function main() {
  await loadEnvFile();
  const resolvedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const resolvedServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!resolvedUrl || !resolvedServiceKey) {
    console.log("Supabase 값이 비어 있어 동기화를 건너뜁니다. (.env.local 입력 후 다시 실행)");
    return;
  }

  console.log("[1/3] JSON 데이터 업로드 시작");
  await uploadJson("reservations.json");
  await uploadJson("resident-db.json");

  console.log("[2/3] 현장 이미지 업로드 시작");
  const imageFiles = await walkFiles(uploadsDir);
  for (const filePath of imageFiles) {
    await uploadImage(filePath);
  }
  if (imageFiles.length === 0) {
    console.log("- 업로드할 로컬 이미지가 없습니다.");
  }

  console.log("[3/3] 완료");
  console.log("Supabase 운영 전환용 데이터 동기화가 완료되었습니다.");
}

main().catch((error) => {
  console.error("동기화 실패:", error instanceof Error ? error.message : error);
  process.exit(1);
});
