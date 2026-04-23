"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const questionSectors = [
  {
    id: "breaker",
    title: "차단기·분전반 상태",
    description: "차단기 노후화와 분전반 안전 상태를 점검합니다.",
    questions: [
      "차단기 설치 후 10년 이상 교체하지 않았다.",
      "차단기 주변이 뜨겁거나 타는 냄새가 난 적이 있다.",
      "차단기 내부/외부에 먼지와 습기가 자주 쌓인다.",
      "차단기가 자주 내려가는데 원인을 모른다.",
      "분전반 문이 헐겁거나 닫힘 상태가 불안정하다."
    ]
  },
  {
    id: "outlet",
    title: "콘센트·배선 사용",
    description: "콘센트 스파크, 접촉불량, 과부하 사용 여부를 점검합니다.",
    questions: [
      "콘센트에서 스파크(불꽃)를 본 적이 있다.",
      "콘센트 사용 시 지직거리는 소리나 냄새가 난다.",
      "플러그를 꽂을 때 콘센트가 헐거워 쉽게 빠진다.",
      "콘센트 주변 벽지가 그을리거나 변색된 부분이 있다.",
      "멀티탭에 고출력 기기를 3개 이상 동시에 사용한다."
    ]
  },
  {
    id: "habit",
    title: "생활 습관·환경 점검",
    description: "일상 전기 사용 습관과 물기·접지·정기점검 상태를 점검합니다.",
    questions: [
      "전자레인지/에어컨 사용 시 조명이 자주 깜빡인다.",
      "젖은 손으로 콘센트/스위치를 만진 적이 자주 있다.",
      "접지(3구) 플러그 대신 2구 변환 어댑터를 자주 사용한다.",
      "욕실/주방 콘센트에 방수 커버가 없거나 파손됐다.",
      "전기 점검을 최근 2년 이상 받지 않았다."
    ]
  }
] as const;

const questions = questionSectors.flatMap((sector) => sector.questions);

type Answer = "high" | "caution" | "unknown" | "safe";
type SectorScore = {
  id: string;
  title: string;
  score: number;
  answeredCount: number;
  questionCount: number;
};

const questionAnswerLabels: Record<number, Record<Answer, string>> = {
  1: { high: "10년 이상 미교체 (위험)", caution: "8~10년 경과 (주의)", unknown: "잘 모르겠음", safe: "최근 교체함 (안전)" },
  2: { high: "열감·탄내 자주 (위험)", caution: "가끔 느낌 (주의)", unknown: "잘 모르겠음", safe: "없음 (안전)" },
  3: { high: "먼지·습기 심함 (위험)", caution: "일부 쌓임 (주의)", unknown: "잘 모르겠음", safe: "관리 양호 (안전)" },
  4: { high: "반복 하강 (위험)", caution: "간헐 하강 (주의)", unknown: "잘 모르겠음", safe: "거의 없음 (안전)" },
  5: { high: "문 고정 불량 (위험)", caution: "닫힘 불안정 (주의)", unknown: "잘 모르겠음", safe: "정상 (안전)" },
  6: { high: "스파크 자주 (위험)", caution: "드물게 발생 (주의)", unknown: "잘 모르겠음", safe: "없음 (안전)" },
  7: { high: "소리·냄새 동반 (위험)", caution: "한 번 이상 경험 (주의)", unknown: "잘 모르겠음", safe: "없음 (안전)" },
  8: { high: "심하게 헐거움 (위험)", caution: "약간 헐거움 (주의)", unknown: "잘 모르겠음", safe: "고정 양호 (안전)" },
  9: { high: "그을림·변색 확인 (위험)", caution: "초기 흔적 의심 (주의)", unknown: "잘 모르겠음", safe: "변색 없음 (안전)" },
  10: { high: "상시 과부하 사용 (위험)", caution: "가끔 과부하 사용 (주의)", unknown: "잘 모르겠음", safe: "분산 사용 (안전)" },
  11: { high: "깜빡임 자주 (위험)", caution: "가끔 깜빡임 (주의)", unknown: "잘 모르겠음", safe: "없음 (안전)" },
  12: { high: "젖은 손 사용 반복 (위험)", caution: "가끔 사용 (주의)", unknown: "잘 모르겠음", safe: "하지 않음 (안전)" },
  13: { high: "2구 어댑터 상시 (위험)", caution: "가끔 사용 (주의)", unknown: "잘 모르겠음", safe: "접지 사용 (안전)" },
  14: { high: "커버 없음/파손 (위험)", caution: "노후·헐거움 (주의)", unknown: "잘 모르겠음", safe: "방수 상태 양호 (안전)" },
  15: { high: "2년 이상 미점검 (위험)", caution: "1~2년 경과 (주의)", unknown: "잘 모르겠음", safe: "정기 점검함 (안전)" }
};

const answerLabelByQuestion = (questionId: number, tone: Answer) => {
  const labels = questionAnswerLabels[questionId];
  if (!labels) return tone === "unknown" ? "잘 모르겠음" : "해당 없음";
  return labels[tone];
};

const sectorComment = (sector: SectorScore) => {
  if (sector.score >= 75) {
    if (sector.id === "breaker") return "차단기·분전반 섹터에서 고위험 징후가 다수 확인되어 긴급 안전점검이 권고됩니다.";
    if (sector.id === "outlet") return "콘센트·배선 섹터에서 과열·스파크 관련 고위험 응답이 집중되어 즉시 조치가 필요합니다.";
    return "생활 습관·환경 섹터에서 감전·화재 연계 가능성이 높은 고위험 패턴이 확인되었습니다.";
  }
  if (sector.score >= 45) {
    if (sector.id === "breaker") return "차단기·분전반 섹터에서 주의 신호가 반복되어 예방 중심의 정밀 점검이 권장됩니다.";
    if (sector.id === "outlet") return "콘센트·배선 섹터에서 잠재 위험 응답이 누적되어 선제 점검이 필요합니다.";
    return "생활 습관·환경 섹터에서 위험 가능성을 높이는 사용 패턴이 일부 확인되었습니다.";
  }
  if (sector.id === "breaker") return "차단기·분전반 섹터는 현재 기준에서 구조적 위험 신호가 낮은 수준으로 평가됩니다.";
  if (sector.id === "outlet") return "콘센트·배선 섹터는 현재 기준에서 사용 중 위험 지표가 낮은 상태로 확인됩니다.";
  return "생활 습관·환경 섹터는 현재 기준에서 전반적으로 안정적인 관리 수준으로 평가됩니다.";
};

const answerButtonClass = (active: boolean, tone: Answer) => {
  if (!active) return "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  if (tone === "high") return "border border-rose-600 bg-rose-600 text-white";
  if (tone === "caution") return "border border-orange-500 bg-orange-500 text-white";
  if (tone === "unknown") return "border border-amber-500 bg-amber-500 text-white";
  return "border border-emerald-600 bg-emerald-600 text-white";
};

export default function SafetyDiagnosisForm() {
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [message, setMessage] = useState("");
  const [emergencyMessage, setEmergencyMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [emergencyPhotos, setEmergencyPhotos] = useState<File[]>([]);
  const emergencyPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [result, setResult] = useState<{ riskScore: number; summary: string; sectorScores: SectorScore[] } | null>(null);
  const appendEmergencyPhotos = (incoming: File[]) => {
    if (incoming.length === 0) return;
    setEmergencyPhotos((prev) => [...prev, ...incoming].slice(0, 5));
  };


  const answeredCount = Object.keys(answers).length;

  const setAnswer = (key: number, value: Answer) => {
    setResult(null);
    setEmergencyMessage("");
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!result || !resultRef.current) return;
    resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const handleSubmit = async () => {
    if (answeredCount !== questions.length) {
      setMessage("15개 문항을 모두 체크해주세요.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const sectorScores = questionSectors.map((sector, sectorIdx) => {
        const startId = sectorIdx * 5 + 1;
        const questionCount = sector.questions.length;
        let raw = 0;
        let answered = 0;
        for (let i = 0; i < questionCount; i += 1) {
          const answer = answers[startId + i];
          if (!answer) continue;
          answered += 1;
          if (answer === "high") raw += 3;
          if (answer === "caution") raw += 2;
          if (answer === "unknown") raw += 1;
        }
        return {
          id: sector.id,
          title: sector.title,
          score: Math.round((raw / (questionCount * 3)) * 100),
          answeredCount: answered,
          questionCount
        };
      });

      const payload = questions.map((_, idx) => ({
        questionId: idx + 1,
        answer: answers[idx + 1]
      }));
      const response = await fetch("/api/resident/diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload })
      });
      const data = (await response.json()) as {
        message: string;
        result?: { riskScore: number; summary: string };
      };
      if (!response.ok) {
        throw new Error(data.message || "저장 실패");
      }
      setResult(
        data.result
          ? { riskScore: data.result.riskScore, summary: data.result.summary, sectorScores }
          : null
      );
      setMessage("자가진단 결과가 저장되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  const requestEmergencyDispatch = async () => {
    if (!result) {
      setEmergencyMessage("자가진단 결과 저장 후 긴급출동을 요청할 수 있습니다.");
      return;
    }
    setEmergencyLoading(true);
    setEmergencyMessage("");
    try {
      const formData = new FormData();
      formData.set("riskScore", String(result.riskScore));
      formData.set("summary", result.summary);
      emergencyPhotos.slice(0, 5).forEach((file) => formData.append("photos", file));
      const response = await fetch("/api/resident/emergency-dispatch", { method: "POST", body: formData });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message || "긴급출동 요청에 실패했습니다.");
      }
      setEmergencyMessage(data.message || "긴급출동 요청이 접수되었습니다.");
      setEmergencyPhotos([]);
    } catch (error) {
      setEmergencyMessage(error instanceof Error ? error.message : "긴급출동 요청 실패");
    } finally {
      setEmergencyLoading(false);
    }
  };

  return (
    <section className="space-y-5">
      {result ? (
        <div
          ref={resultRef}
          className="relative overflow-hidden rounded-3xl border-2 border-amber-400/80 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-6 text-white shadow-[0_20px_50px_rgba(15,23,42,0.45)] ring-4 ring-amber-400/25 md:p-8"
        >
          <div className="absolute right-4 top-4 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-200">
            자가진단 결과
          </div>
          <p className="text-sm font-semibold text-slate-300">위험지수 (만점 100점)</p>
          <p className="mt-2 flex flex-wrap items-baseline gap-1">
            <span className="text-5xl font-extrabold tracking-tight text-white md:text-6xl">{result.riskScore}</span>
            <span className="text-2xl font-bold text-slate-400">/ 100</span>
            <span className="ml-1 text-sm text-slate-400">점</span>
          </p>
          <div className="mt-5 grid gap-2 md:grid-cols-3">
            {result.sectorScores.map((sector) => (
              <div key={sector.id} className="rounded-xl border border-white/20 bg-white/10 px-3 py-3">
                <p className="text-xs font-semibold text-slate-300">{sector.title}</p>
                <p className="mt-1 text-2xl font-extrabold text-white">
                  {sector.score}
                  <span className="ml-1 text-sm font-semibold text-slate-300">/100</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-300">
                  응답 {sector.answeredCount}/{sector.questionCount}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-200">{sectorComment(sector)}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-100">{result.summary}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href={`/reservation?source=diagnosis&riskScore=${result.riskScore}`}
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-slate-900 shadow hover:bg-slate-100"
            >
              점검 예약 바로하기
            </Link>
            <button
              type="button"
              onClick={() => void requestEmergencyDispatch()}
              disabled={emergencyLoading}
              className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow hover:bg-rose-700 disabled:opacity-60"
            >
              {emergencyLoading ? "요청 중..." : "긴급출동 요청"}
            </button>
          </div>
          <div className="mt-3 rounded-xl border border-white/20 bg-white/10 p-3">
            <p className="text-xs text-slate-200">긴급출동 현장 사진 첨부 (선택, 최대 5장)</p>
            <input
              ref={emergencyPhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => {
                appendEmergencyPhotos(Array.from(e.target.files ?? []));
                e.currentTarget.value = "";
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => emergencyPhotoInputRef.current?.click()}
              disabled={emergencyPhotos.length >= 5}
              className="mt-2 inline-flex items-center rounded-lg border border-white/30 bg-white/20 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              + 사진 추가 ({emergencyPhotos.length}/5)
            </button>
          </div>
          {emergencyMessage ? <p className="mt-3 text-sm text-amber-100">{emergencyMessage}</p> : null}
        </div>
      ) : null}

      <div className="surface-card rounded-2xl p-5">
        <h2 className="text-2xl font-bold">입주민 전기 안전 자가진단</h2>
        <p className="mt-1 text-sm text-slate-600">차단기 노후화와 콘센트 스파크 위험을 중심으로 점검합니다.</p>
        <p className="mt-2 text-xs font-medium text-slate-500">
          위험지수는 응답을 바탕으로 산출한 <span className="text-primary">100점 만점</span> 점수입니다. (위험/주의 응답 비중이 높을수록 점수가 올라갑니다.)
        </p>
        <p className="mt-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-2 text-sm text-blue-800">
          진행상황: <span className="font-semibold">{answeredCount} / 15</span>
        </p>
      </div>

      <div className="space-y-4">
        {questionSectors.map((sector, sectorIdx) => {
          const startId = sectorIdx * 5 + 1;
          const sectorAnswered = sector.questions.filter((_, idx) => answers[startId + idx]).length;
          return (
            <section key={sector.id} className="surface-card rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-base font-bold text-slate-900">{sector.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{sector.description}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {sectorAnswered}/{sector.questions.length}
                </span>
              </div>
              <div className="space-y-3">
                {sector.questions.map((question, idx) => {
                  const key = startId + idx;
                  const selected = answers[key];
                  return (
                    <article key={question} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {key}. {question}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setAnswer(key, "high")}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold ${answerButtonClass(selected === "high", "high")}`}
                        >
                          {answerLabelByQuestion(key, "high")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnswer(key, "caution")}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold ${answerButtonClass(selected === "caution", "caution")}`}
                        >
                          {answerLabelByQuestion(key, "caution")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnswer(key, "unknown")}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold ${answerButtonClass(selected === "unknown", "unknown")}`}
                        >
                          {answerLabelByQuestion(key, "unknown")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnswer(key, "safe")}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold ${answerButtonClass(selected === "safe", "safe")}`}
                        >
                          {answerLabelByQuestion(key, "safe")}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="surface-card rounded-2xl p-5">
        <div className="mb-3 flex justify-end">
          <Link href="/resident/history" className="btn-outline px-3 py-2 text-sm">
            내 진단 이력 보기
          </Link>
        </div>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading}
          className="btn-primary w-full px-4 py-3 text-sm disabled:opacity-60"
        >
          {loading ? "저장 중..." : "자가진단 결과 저장하기"}
        </button>
        {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
      </div>
    </section>
  );
}
