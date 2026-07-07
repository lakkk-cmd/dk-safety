/**
 * dk-blog-factory 2단계: 네이버 검색광고 API 키워드 조사 모듈 (블랙키위 대체, 무료)
 *
 * env: NAVER_AD_API_KEY, NAVER_AD_SECRET, NAVER_AD_CUSTOMER_ID
 * (searchad.naver.com → 도구 → API 사용관리에서 발급)
 *
 * 키가 없으면 결정적(deterministic) mock 데이터를 반환한다 — 워커 개발/테스트가
 * 키 발급을 기다리지 않게 하기 위함. 반환값의 source 필드로 구분 가능.
 */
import crypto from "node:crypto";

const API_BASE = "https://api.searchad.naver.com";
const KEYWORD_TOOL_PATH = "/keywordstool";

export function isNaverAdConfigured() {
  return Boolean(
    process.env.NAVER_AD_API_KEY?.trim() &&
      process.env.NAVER_AD_SECRET?.trim() &&
      process.env.NAVER_AD_CUSTOMER_ID?.trim()
  );
}

/**
 * 네이버 검색광고 API의 조회수 필드 파싱 — 숫자, "1,234" 문자열,
 * "< 10"(10 미만) 세 형태가 모두 온다.
 */
export function parseVolume(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  if (trimmed.startsWith("<")) return 5; // "< 10" — 근사값
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function signRequest(timestamp, method, path, secret) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${method}.${path}`).digest("base64");
}

async function fetchKeywordStatsFromApi(seeds) {
  const apiKey = process.env.NAVER_AD_API_KEY.trim();
  const secret = process.env.NAVER_AD_SECRET.trim();
  const customerId = process.env.NAVER_AD_CUSTOMER_ID.trim();

  // API 제약: 시드 최대 5개, 키워드 내 공백 제거 필요
  const hintKeywords = seeds
    .slice(0, 5)
    .map((s) => s.replace(/\s+/g, ""))
    .join(",");
  const timestamp = String(Date.now());
  const url = `${API_BASE}${KEYWORD_TOOL_PATH}?hintKeywords=${encodeURIComponent(hintKeywords)}&showDetail=1`;

  const res = await fetch(url, {
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": apiKey,
      "X-Customer": customerId,
      "X-Signature": signRequest(timestamp, "GET", KEYWORD_TOOL_PATH, secret),
    },
  });
  if (!res.ok) {
    throw new Error(`네이버 검색광고 API 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const list = Array.isArray(data.keywordList) ? data.keywordList : [];
  return list.map((k) => {
    const pc = parseVolume(k.monthlyPcQcCnt);
    const mobile = parseVolume(k.monthlyMobileQcCnt);
    return {
      keyword: String(k.relKeyword ?? "").trim(),
      monthlyPcVolume: pc,
      monthlyMobileVolume: mobile,
      monthlyTotal: pc + mobile,
      competition: k.compIdx ?? "알수없음", // '낮음' | '중간' | '높음'
    };
  });
}

// ─── mock (키 미발급 상태 개발/테스트용) ─────────────────────────────────────────

/** 문자열 → 안정적인 의사난수 (같은 시드는 항상 같은 결과) */
function stableHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const MOCK_VARIANTS = ["", " 비용", " 교체", " 방법", " 원인", "아파트 "];
const COMPETITIONS = ["낮음", "중간", "높음"];

function mockKeywordStats(seeds) {
  const result = [];
  for (const seed of seeds) {
    for (const variant of MOCK_VARIANTS) {
      const keyword = variant.startsWith(" ") ? `${seed}${variant}` : `${variant}${seed}`.trim();
      const h = stableHash(keyword);
      const mobile = 100 + (h % 7900); // 100~7999
      const pc = Math.floor(mobile * 0.3);
      result.push({
        keyword,
        monthlyPcVolume: pc,
        monthlyMobileVolume: mobile,
        monthlyTotal: pc + mobile,
        competition: COMPETITIONS[h % 3],
      });
    }
  }
  return result;
}

/**
 * 시드 키워드들의 연관 키워드 + 월간 조회수(PC/모바일) + 경쟁정도 조회.
 * @returns {{ source: 'api'|'mock', keywords: Array<{keyword, monthlyPcVolume, monthlyMobileVolume, monthlyTotal, competition}> }}
 */
export async function getKeywordStats(seeds) {
  const cleaned = (seeds ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (cleaned.length === 0) throw new Error("시드 키워드가 최소 1개 필요합니다");

  if (!isNaverAdConfigured()) {
    return { source: "mock", keywords: mockKeywordStats(cleaned) };
  }
  return { source: "api", keywords: await fetchKeywordStatsFromApi(cleaned) };
}
