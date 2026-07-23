import { createHmac, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  answerToRiskPoints,
  computeRawRiskPoints,
  type DiagnosisAnswerValue,
  diagnosisRiskScoreOn100,
  DIAGNOSIS_CAUTION_MIN,
  DIAGNOSIS_HIGH_RISK_MIN,
  DIAGNOSIS_RAW_MAX,
  rawPointsToScore100,
  summaryFromScore100
} from "@/lib/diagnosis-score";
import {
  readJsonObject,
  SUPABASE_DATA_BUCKET,
  SUPABASE_ENABLED,
  writeJsonObject
} from "@/lib/supabase-server";

export type Apartment = {
  id: string;
  name: string;
  address?: string;
  addressType?: "road" | "jibun";
  /** 실제 Postgres `apartments.apt_code`와의 연결고리. 매칭되면 이후 로그인/자가진단은 이름이 아닌 이 코드로 식별해 중복 생성을 막는다. */
  code?: string;
  city: string;
  yearsOld: number;
  createdAt: string;
};

export type ResidentUser = {
  id: string;
  name: string;
  phone: string;
  apartmentId: string;
  apartmentName: string;
  unitNumber: string;
  createdAt: string;
  lastLoginAt: string;
};

export type ResidentSession = {
  id: string;
  userId: string;
  createdAt: string;
};

export type DiagnosisAnswer = {
  questionId: number;
  answer: DiagnosisAnswerValue;
};

export type DiagnosisRecord = {
  id: string;
  userId: string;
  createdAt: string;
  answers: DiagnosisAnswer[];
  /** 0~100 위험지수(scoreVersion 2). v1 레코드는 구 시스템의 0~30 원점수가 저장되어 있음. */
  riskScore: number;
  /** 2: riskScore가 100점 만점 환산값. 미부여·1: 구버전 원점수(최대 30). */
  scoreVersion?: 1 | 2 | 3;
  sectorScores?: Array<{
    id: "breaker" | "outlet" | "habit";
    title: string;
    score: number;
  }>;
  summary: string;
};

export type ResidentActivity = {
  id: string;
  userId: string;
  action: "login" | "diagnosis_submitted" | "apartment_added" | "emergency_requested";
  message: string;
  createdAt: string;
};

type ResidentDb = {
  apartments: Apartment[];
  users: ResidentUser[];
  sessions: ResidentSession[];
  diagnoses: DiagnosisRecord[];
  activities: ResidentActivity[];
};

const dbPath = path.join(process.cwd(), "data", "resident-db.json");
const cloudDbKey = "resident-db.json";
const RESIDENT_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const diagnosisSectors = [
  { id: "breaker", title: "차단기", questionIds: [1, 2] },
  { id: "outlet", title: "콘센트·스위치", questionIds: [3, 4] },
  { id: "habit", title: "생활환경", questionIds: [5, 6] }
] as const;

const defaultApartments = [
  "유니버시아드힐스테이트3단지",
  "봉선한국아델리움",
  "첨단중흥S클래스",
  "상무자이",
  "수완대주피오레",
  "운암동두산위브",
  "화정아이파크",
  "진월힐스테이트",
  "풍암금호타운",
  "문흥라인아파트"
];

function buildSeedDb(now: string): ResidentDb {
  return {
    apartments: defaultApartments.map((name, index) => ({
      id: `apt-${index + 1}`,
      name,
      city: "광주",
      yearsOld: 8 + (index % 9),
      createdAt: now
    })),
    users: [],
    sessions: [],
    diagnoses: [],
    activities: []
  };
}

function getResidentFallbackDb(): ResidentDb {
  const g = globalThis as typeof globalThis & { __dkResidentFallbackDb?: ResidentDb };
  if (!g.__dkResidentFallbackDb) {
    g.__dkResidentFallbackDb = buildSeedDb(new Date().toISOString());
  }
  return g.__dkResidentFallbackDb;
}

function isReadonlyFsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = (error as Error & { code?: string }).message ?? "";
  const code = (error as Error & { code?: string }).code ?? "";
  return code === "EROFS" || message.includes("EROFS: read-only file system");
}

function residentSessionSecret(): string {
  return process.env.RESIDENT_SESSION_SECRET?.trim() || process.env.WORKER_SESSION_SECRET?.trim() || "resident-session-fallback";
}

function signResidentSessionUser(user: ResidentUser): string {
  const payload = JSON.stringify({
    id: user.id,
    name: user.name,
    phone: user.phone,
    apartmentId: user.apartmentId,
    apartmentName: user.apartmentName,
    unitNumber: user.unitNumber,
    exp: Date.now() + RESIDENT_SESSION_TTL_MS
  });
  const payloadB64 = Buffer.from(payload, "utf-8").toString("base64url");
  const sig = createHmac("sha256", residentSessionSecret()).update(payloadB64).digest("base64url");
  return `rsess.${payloadB64}.${sig}`;
}

function verifyResidentSessionUser(token: string): ResidentUser | null {
  if (!token.startsWith("rsess.")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payloadB64 = parts[1];
  const sig = parts[2];
  const expected = createHmac("sha256", residentSessionSecret()).update(payloadB64).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8")) as {
      id: string;
      name: string;
      phone: string;
      apartmentId: string;
      apartmentName: string;
      unitNumber: string;
      exp: number;
    };
    if (!parsed.id || !parsed.name || !parsed.phone || !parsed.apartmentId || !parsed.unitNumber) return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp < Date.now()) return null;
    const now = new Date().toISOString();
    return {
      id: parsed.id,
      name: parsed.name,
      phone: parsed.phone,
      apartmentId: parsed.apartmentId,
      apartmentName: parsed.apartmentName || "",
      unitNumber: parsed.unitNumber,
      createdAt: now,
      lastLoginAt: now
    };
  } catch {
    return null;
  }
}

async function ensureDb() {
  if (SUPABASE_ENABLED) {
    return;
  }
  try {
    await fs.access(dbPath);
  } catch (error) {
    if (isReadonlyFsError(error)) {
      getResidentFallbackDb();
      return;
    }
    const now = new Date().toISOString();
    const seed: ResidentDb = buildSeedDb(now);
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.writeFile(dbPath, JSON.stringify(seed, null, 2), "utf-8");
  }
}

function parseResidentDbJson(raw: string): ResidentDb {
  const cleaned = raw.replaceAll("\u0000", "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    throw new Error("resident-db.json 내용이 비어 있습니다.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("resident-db.json 형식이 올바르지 않습니다.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("resident-db.json 루트가 객체가 아닙니다.");
  }
  const obj = parsed as Partial<ResidentDb>;
  return {
    apartments: Array.isArray(obj.apartments) ? (obj.apartments as Apartment[]) : [],
    users: Array.isArray(obj.users) ? (obj.users as ResidentUser[]) : [],
    sessions: Array.isArray(obj.sessions) ? (obj.sessions as ResidentSession[]) : [],
    diagnoses: Array.isArray(obj.diagnoses) ? (obj.diagnoses as DiagnosisRecord[]) : [],
    activities: Array.isArray(obj.activities) ? (obj.activities as ResidentActivity[]) : []
  };
}

async function readDb(): Promise<ResidentDb> {
  if (SUPABASE_ENABLED) {
    try {
      const cloud = await readJsonObject<ResidentDb>(SUPABASE_DATA_BUCKET, cloudDbKey);
      if (cloud) {
        return {
          apartments: Array.isArray(cloud.apartments) ? cloud.apartments : [],
          users: Array.isArray(cloud.users) ? cloud.users : [],
          sessions: Array.isArray(cloud.sessions) ? cloud.sessions : [],
          diagnoses: Array.isArray(cloud.diagnoses) ? cloud.diagnoses : [],
          activities: Array.isArray(cloud.activities) ? cloud.activities : []
        };
      }
      const seed = buildSeedDb(new Date().toISOString());
      await writeJsonObject(SUPABASE_DATA_BUCKET, cloudDbKey, seed);
      return seed;
    } catch (error) {
      // Supabase 스토리지 읽기 실패(권한/엔드포인트/일시 장애)에도 로그인 화면이 멈추지 않게
      // 기본 아파트 목록으로 폴백합니다.
      console.error("[resident-db] Supabase read fallback:", error);
      return getResidentFallbackDb();
    }
  }

  await ensureDb();
  try {
    const raw = await fs.readFile(dbPath, "utf-8");
    return parseResidentDbJson(raw);
  } catch (error) {
    if (isReadonlyFsError(error)) {
      return getResidentFallbackDb();
    }
    throw error;
  }
}

async function writeDb(next: ResidentDb) {
  if (SUPABASE_ENABLED) {
    await writeJsonObject(SUPABASE_DATA_BUCKET, cloudDbKey, next);
    return;
  }
  try {
    await fs.writeFile(dbPath, JSON.stringify(next, null, 2), "utf-8");
  } catch (error) {
    if (isReadonlyFsError(error)) {
      const g = globalThis as typeof globalThis & { __dkResidentFallbackDb?: ResidentDb };
      g.__dkResidentFallbackDb = next;
      return;
    }
    throw error;
  }
}

export async function listApartments() {
  const db = await readDb();
  const list = Array.isArray(db.apartments) ? db.apartments : [];
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export async function addApartment(name: string, address?: string, addressType?: "road" | "jibun") {
  const db = await readDb();
  const trimmed = name.trim();
  const trimmedAddress = (address ?? "").trim();
  if (!trimmed) {
    throw new Error("아파트명을 입력해주세요.");
  }
  if (db.apartments.some((item) => item.name === trimmed)) {
    throw new Error("이미 등록된 아파트입니다.");
  }

  const next: Apartment = {
    id: `apt-${crypto.randomUUID()}`,
    name: trimmed,
    address: trimmedAddress || undefined,
    addressType: addressType ?? undefined,
    city: "광주",
    yearsOld: 8,
    createdAt: new Date().toISOString()
  };
  db.apartments.push(next);
  db.activities.unshift({
    id: `act-${crypto.randomUUID()}`,
    userId: "system",
    action: "apartment_added",
    message: `아파트 자동등록/수동추가: ${next.name}`,
    createdAt: new Date().toISOString()
  });
  db.activities = db.activities.slice(0, 1000);
  await writeDb(db);
  return next;
}

/**
 * apt_code로 실제 Postgres `apartments` 테이블과 연결한다. 이름이 조금씩 다르게 입력되어도
 * (오타/공백/구분자 표기 차이) 같은 단지가 계속 새로 생성되던 문제의 구조적 해결책 —
 * 코드가 있으면 이름 대신 코드로만 동일 단지를 식별한다. db는 in-place로 변경되므로
 * 호출자가 이후 writeDb(db)를 책임진다.
 */
async function resolveApartmentByCode(db: ResidentDb, code: string): Promise<Apartment | null> {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;

  const existing = db.apartments.find((item) => item.code === normalized);
  if (existing) return existing;

  try {
    const { pgFindApartmentByCode } = await import("@/lib/apartments-pg");
    const real = await pgFindApartmentByCode(normalized);
    if (!real) return null;

    const byName = db.apartments.find((item) => item.name === real.name);
    if (byName) {
      byName.code = normalized;
      return byName;
    }

    const created: Apartment = {
      id: `apt-${crypto.randomUUID()}`,
      name: real.name,
      code: normalized,
      city: "광주",
      yearsOld: 0,
      createdAt: new Date().toISOString()
    };
    db.apartments.push(created);
    db.activities.unshift({
      id: `act-${crypto.randomUUID()}`,
      userId: "system",
      action: "apartment_added",
      message: `apt_code(${normalized}) 매칭으로 단지 연결: ${created.name}`,
      createdAt: new Date().toISOString()
    });
    db.activities = db.activities.slice(0, 1000);
    return created;
  } catch (error) {
    console.error("[resident-db] resolveApartmentByCode:", error);
    return null;
  }
}

/**
 * 익명(비로그인) 자가진단 제출 시 `?tenant=` 코드로 실제 단지를 알아내기 위한 공개 헬퍼.
 * 세션이 없는 요청 경로에서 db를 새로 읽고 필요 시 새 단지를 저장한다.
 */
export async function resolveApartmentInfoByCode(code: string): Promise<{ id: string; name: string; code: string } | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const db = await readDb();
  const apartment = await resolveApartmentByCode(db, trimmed);
  if (!apartment) return null;
  await writeDb(db);
  return { id: apartment.id, name: apartment.name, code: apartment.code ?? trimmed.toLowerCase() };
}

export async function createResidentSession(payload: {
  name: string;
  phone: string;
  apartmentId?: string;
  apartmentName?: string;
  apartmentCode?: string;
  unitNumber: string;
}) {
  const db = await readDb();
  let apartment: Apartment | null = payload.apartmentCode?.trim()
    ? await resolveApartmentByCode(db, payload.apartmentCode)
    : null;

  apartment =
    apartment ??
    (payload.apartmentId ? db.apartments.find((item) => item.id === payload.apartmentId) : null) ??
    (payload.apartmentName ? db.apartments.find((item) => item.name === payload.apartmentName) : null) ??
    null;

  if (!apartment && payload.apartmentName?.trim()) {
    apartment = {
      id: `apt-${crypto.randomUUID()}`,
      name: payload.apartmentName.trim(),
      city: "광주",
      yearsOld: 0,
      createdAt: new Date().toISOString()
    };
    db.apartments.push(apartment);
    db.activities.unshift({
      id: `act-${crypto.randomUUID()}`,
      userId: "system",
      action: "apartment_added",
      message: `멀티테넌트 로그인 자동매핑: ${apartment.name}${payload.apartmentCode ? ` (${payload.apartmentCode})` : ""}`,
      createdAt: new Date().toISOString()
    });
    db.activities = db.activities.slice(0, 1000);
  }

  if (!apartment) {
    throw new Error("선택한 아파트를 찾을 수 없습니다.");
  }

  const now = new Date().toISOString();
  const normalizedPhone = payload.phone.replaceAll(/[^0-9]/g, "");
  let user = db.users.find(
    (item) => item.phone.replaceAll(/[^0-9]/g, "") === normalizedPhone && item.unitNumber === payload.unitNumber
  );

  if (!user) {
    user = {
      id: `usr-${crypto.randomUUID()}`,
      name: payload.name.trim(),
      phone: payload.phone.trim(),
      apartmentId: apartment.id,
      apartmentName: apartment.name,
      unitNumber: payload.unitNumber.trim(),
      createdAt: now,
      lastLoginAt: now
    };
    db.users.unshift(user);
  } else {
    user.name = payload.name.trim();
    user.phone = payload.phone.trim();
    user.apartmentId = apartment.id;
    user.apartmentName = apartment.name;
    user.lastLoginAt = now;
  }

  const session: ResidentSession = {
    id: signResidentSessionUser(user),
    userId: user.id,
    createdAt: now
  };
  db.sessions.unshift(session);
  db.activities.unshift({
    id: `act-${crypto.randomUUID()}`,
    userId: user.id,
    action: "login",
    message: `${user.name} 입주민 로그인`,
    createdAt: now
  });
  db.activities = db.activities.slice(0, 1000);
  await writeDb(db);
  return { user, session };
}

export async function getResidentBySessionId(sessionId: string) {
  const stateless = verifyResidentSessionUser(sessionId);
  if (stateless) {
    return stateless;
  }
  try {
    const db = await readDb();
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return null;
    }
    return db.users.find((item) => item.id === session.userId) ?? null;
  } catch (error) {
    console.error("[resident-db] getResidentBySessionId:", error);
    return null;
  }
}

export async function removeSession(sessionId: string) {
  if (sessionId.startsWith("rsess.")) {
    return;
  }
  const db = await readDb();
  db.sessions = db.sessions.filter((item) => item.id !== sessionId);
  await writeDb(db);
}

export async function saveDiagnosis(userId: string, answers: DiagnosisAnswer[], userFallback?: ResidentUser) {
  const db = await readDb();
  let user = db.users.find((item) => item.id === userId);
  if (!user && userFallback) {
    user = {
      ...userFallback,
      createdAt: userFallback.createdAt || new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };
    db.users.unshift(user);
  }
  if (!user) {
    throw new Error("로그인 세션이 유효하지 않습니다.");
  }

  const rawPoints = computeRawRiskPoints(answers);
  const riskScore = rawPointsToScore100(rawPoints);
  const summary = summaryFromScore100(riskScore);
  const answerByQuestionId = new Map(answers.map((item) => [item.questionId, item.answer]));
  const sectorScores = diagnosisSectors.map((sector) => {
    const raw = sector.questionIds.reduce((acc, questionId) => {
      const answer = answerByQuestionId.get(questionId);
      if (!answer) return acc;
      return acc + answerToRiskPoints(answer);
    }, 0);
    return {
      id: sector.id,
      title: sector.title,
      score: Math.round((raw / (sector.questionIds.length * 3)) * 100)
    };
  });

  const record: DiagnosisRecord = {
    id: `diag-${crypto.randomUUID()}`,
    userId,
    createdAt: new Date().toISOString(),
    answers,
    riskScore,
    scoreVersion: 3,
    sectorScores,
    summary
  };

  db.diagnoses.unshift(record);
  db.activities.unshift({
    id: `act-${crypto.randomUUID()}`,
    userId,
    action: "diagnosis_submitted",
    message: `${user.name} 입주민 자가진단 제출 (위험지수 ${riskScore}/100점, 원점수 ${rawPoints}/${DIAGNOSIS_RAW_MAX})`,
    createdAt: new Date().toISOString()
  });
  db.activities = db.activities.slice(0, 1000);
  await writeDb(db);
  return record;
}

export async function listDiagnosesByUser(userId: string, limit = 20) {
  const db = await readDb();
  return db.diagnoses.filter((item) => item.userId === userId).slice(0, limit);
}

/** 비로그인(게스트) 자가진단 제출자 — id가 saveDiagnosis의 fallbackUser 패턴(`guest-<uuid>`)을 따른다. */
function isGuestUserId(userId: string): boolean {
  return userId.startsWith("guest-");
}

export async function getResidentSafetyAnalytics() {
  const db = await readDb();
  const usersById = new Map(db.users.map((user) => [user.id, user]));
  const realUsers = db.users.filter((user) => !isGuestUserId(user.id));
  const realDiagnoses = db.diagnoses.filter((item) => !isGuestUserId(item.userId));
  const guestDiagnoses = db.diagnoses.filter((item) => isGuestUserId(item.userId));

  const summarize = (items: DiagnosisRecord[]) => ({
    high: items.filter((item) => diagnosisRiskScoreOn100(item) >= DIAGNOSIS_HIGH_RISK_MIN).length,
    caution: items.filter(
      (item) =>
        diagnosisRiskScoreOn100(item) >= DIAGNOSIS_CAUTION_MIN &&
        diagnosisRiskScoreOn100(item) < DIAGNOSIS_HIGH_RISK_MIN
    ).length,
    normal: items.filter((item) => diagnosisRiskScoreOn100(item) < DIAGNOSIS_CAUTION_MIN).length
  });

  // 입주민 통계(riskSummary)는 실명 입주민 응답만 반영한다 — 비로그인 제출은 별도 guestSummary로 분리.
  const riskSummary = summarize(realDiagnoses);
  const guestSummary = { count: guestDiagnoses.length, ...summarize(guestDiagnoses) };

  const apartmentStats = db.apartments
    .map((apartment) => {
      const residents = realUsers.filter((user) => user.apartmentId === apartment.id);
      const residentIds = new Set(residents.map((user) => user.id));
      const diagnoses = realDiagnoses.filter((diag) => residentIds.has(diag.userId));
      const avgScore = diagnoses.length
        ? Math.round(
            (diagnoses.reduce((sum, diag) => sum + diagnosisRiskScoreOn100(diag), 0) / diagnoses.length) * 10
          ) / 10
        : 0;
      const highRiskCount = diagnoses.filter((diag) => diagnosisRiskScoreOn100(diag) >= DIAGNOSIS_HIGH_RISK_MIN).length;
      return {
        apartmentId: apartment.id,
        apartmentName: apartment.name,
        residentCount: residents.length,
        diagnosisCount: diagnoses.length,
        highRiskCount,
        avgScore
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);

  const highRiskCases = realDiagnoses
    .filter((diag) => diagnosisRiskScoreOn100(diag) >= DIAGNOSIS_HIGH_RISK_MIN)
    .map((diag) => {
      const user = usersById.get(diag.userId);
      return {
        diagnosisId: diag.id,
        residentName: user?.name ?? "알수없음",
        phone: user?.phone ?? "-",
        apartmentName: user?.apartmentName ?? "-",
        unitNumber: user?.unitNumber ?? "-",
        riskScore: diagnosisRiskScoreOn100(diag),
        summary: diag.summary,
        createdAt: diag.createdAt
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);

  const recentLogins = [...realUsers]
    .sort((a, b) => b.lastLoginAt.localeCompare(a.lastLoginAt))
    .slice(0, 12)
    .map((user) => ({
      userId: user.id,
      name: user.name,
      phone: user.phone,
      apartmentName: user.apartmentName,
      unitNumber: user.unitNumber,
      lastLoginAt: user.lastLoginAt
    }));

  return {
    totals: {
      apartmentCount: db.apartments.length,
      residentCount: realUsers.length,
      diagnosisCount: realDiagnoses.length
    },
    riskSummary,
    guestSummary,
    apartmentStats,
    highRiskCases,
    recentLogins
  };
}

export async function appendResidentActivity(payload: Omit<ResidentActivity, "id" | "createdAt">) {
  const db = await readDb();
  db.activities.unshift({
    id: `act-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...payload
  });
  db.activities = db.activities.slice(0, 1000);
  await writeDb(db);
}
