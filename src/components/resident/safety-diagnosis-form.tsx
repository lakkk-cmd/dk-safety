"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const questionSectors = [
  {
    id: "breaker",
    title: "⚡ 차단기",
    description: "전기가 갑자기 꺼지는지 쉽게 확인해요.",
    questions: ["💡 집 불이 갑자기 꺼졌다가 다시 켜진 적이 자주 있나요?", "👃 전기함(차단기) 근처에서 타는 냄새나 이상한 소리가 난 적이 있나요?"]
  },
  {
    id: "outlet",
    title: "🔌 콘센트·스위치",
    description: "손으로 만지는 콘센트/스위치 상태를 확인해요.",
    questions: ["✋ 콘센트나 스위치를 만졌을 때 많이 뜨거웠던 적이 있나요?", "✨ 코드를 꽂을 때 번쩍(불꽃) 하거나 탄 냄새가 난 적이 있나요?"]
  },
  {
    id: "habit",
    title: "🏠 생활환경",
    description: "평소 전기 사용 습관을 확인해요.",
    questions: ["🧵 겉이 벗겨진 전선(속선 보임)을 그냥 쓰는 곳이 있나요?", "🧰 멀티탭 하나에 기기를 아주 많이 꽂아서 쓰고 있나요?"]
  }
] as const;

const questions = questionSectors.flatMap((sector) => sector.questions);

type Answer = "high" | "caution" | "unknown" | "safe";

const questionAnswerLabels: Record<number, Record<Answer, string>> = {
  1: { high: "네, 자주 있어요", caution: "가끔 있어요", unknown: "잘 모르겠어요", safe: "아니요, 없어요" },
  2: { high: "네, 자주 있어요", caution: "가끔 있어요", unknown: "잘 모르겠어요", safe: "아니요, 없어요" },
  3: { high: "네, 자주 있어요", caution: "가끔 있어요", unknown: "잘 모르겠어요", safe: "아니요, 없어요" },
  4: { high: "네, 자주 있어요", caution: "가끔 있어요", unknown: "잘 모르겠어요", safe: "아니요, 없어요" },
  5: { high: "네, 있어요", caution: "조금 있어요", unknown: "잘 모르겠어요", safe: "아니요, 없어요" },
  6: { high: "네, 있어요", caution: "조금 있어요", unknown: "잘 모르겠어요", safe: "아니요, 없어요" }
};

const answerLabelByQuestion = (questionId: number, tone: Answer) => {
  const labels = questionAnswerLabels[questionId];
  if (!labels) return tone === "unknown" ? "잘 모르겠음" : "해당 없음";
  return labels[tone];
};

const answerButtonClass = (active: boolean, tone: Answer) => {
  if (!active) return "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  if (tone === "high") return "border border-rose-600 bg-rose-600 text-white";
  if (tone === "caution") return "border border-orange-500 bg-orange-500 text-white";
  if (tone === "unknown") return "border border-amber-500 bg-amber-500 text-white";
  return "border border-emerald-600 bg-emerald-600 text-white";
};

export default function SafetyDiagnosisForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(1);


  const answeredCount = Object.keys(answers).length;
  const currentQuestionText = questions[currentQuestion - 1];
  const currentAnswer = answers[currentQuestion];
  const currentSector = questionSectors[Math.floor((currentQuestion - 1) / 2)];
  const resultStorageKey = "resident-diagnosis-result-v1";

  const setAnswer = (key: number, value: Answer) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (answeredCount !== questions.length) {
      setMessage("6개 문항을 모두 선택해주세요.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const sectorScores = questionSectors.map((sector, sectorIdx) => {
        const startId = questionSectors.slice(0, sectorIdx).reduce((acc, item) => acc + item.questions.length, 0) + 1;
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
      if (data.result) {
        const tenant = searchParams.get("tenant")?.trim();
        const resultHref = tenant ? `/resident/safety-check/result?tenant=${encodeURIComponent(tenant)}` : "/resident/safety-check/result";
        window.sessionStorage.setItem(
          resultStorageKey,
          JSON.stringify({
            riskScore: data.result.riskScore,
            summary: data.result.summary,
            sectorScores
          })
        );
        router.push(resultHref);
        return;
      }
      setMessage("결과를 불러오지 못했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="surface-card rounded-2xl p-[clamp(0.85rem,2.1vh,1.1rem)]">
        <p className="text-xs font-medium leading-snug text-slate-500">
          위험지수는 응답을 바탕으로 산출한 <span className="text-primary">100점 만점</span> 점수입니다. (위험/주의 응답 비중이 높을수록 점수가 올라갑니다.)
        </p>
        <p className="mt-2 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-2 text-sm text-blue-800">
          진행상황: <span className="font-semibold">{answeredCount} / {questions.length}</span>
        </p>
      </div>

      <section className="surface-card rounded-2xl p-[clamp(0.75rem,2vh,1rem)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-base font-bold text-slate-900">{currentSector.title}</p>
            <p className="mt-1 text-xs text-slate-500">{currentSector.description}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {currentQuestion} / {questions.length}
          </span>
        </div>
        <article className="rounded-xl border border-slate-200 p-2.5">
          <p className="text-sm font-semibold text-slate-900">
            {currentQuestion}. {currentQuestionText}
          </p>
          <div className="mt-2 grid gap-1.5">
            <button
              type="button"
              onClick={() => setAnswer(currentQuestion, "high")}
              className={`h-[clamp(2.5rem,5vh,3rem)] rounded-lg px-3 text-sm font-semibold ${answerButtonClass(currentAnswer === "high", "high")}`}
            >
              {answerLabelByQuestion(currentQuestion, "high")}
            </button>
            <button
              type="button"
              onClick={() => setAnswer(currentQuestion, "caution")}
              className={`h-[clamp(2.5rem,5vh,3rem)] rounded-lg px-3 text-sm font-semibold ${answerButtonClass(currentAnswer === "caution", "caution")}`}
            >
              {answerLabelByQuestion(currentQuestion, "caution")}
            </button>
            <button
              type="button"
              onClick={() => setAnswer(currentQuestion, "unknown")}
              className={`h-[clamp(2.5rem,5vh,3rem)] rounded-lg px-3 text-sm font-semibold ${answerButtonClass(currentAnswer === "unknown", "unknown")}`}
            >
              {answerLabelByQuestion(currentQuestion, "unknown")}
            </button>
            <button
              type="button"
              onClick={() => setAnswer(currentQuestion, "safe")}
              className={`h-[clamp(2.5rem,5vh,3rem)] rounded-lg px-3 text-sm font-semibold ${answerButtonClass(currentAnswer === "safe", "safe")}`}
            >
              {answerLabelByQuestion(currentQuestion, "safe")}
            </button>
          </div>
        </article>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setCurrentQuestion((prev) => Math.max(1, prev - 1))}
            disabled={currentQuestion === 1}
            className="btn-outline h-[clamp(2.5rem,5vh,3rem)] px-4 text-sm disabled:opacity-50"
          >
            이전
          </button>
          {currentQuestion < questions.length ? (
            <button
              type="button"
              onClick={() => setCurrentQuestion((prev) => Math.min(questions.length, prev + 1))}
              disabled={!currentAnswer}
              className="btn-primary h-[clamp(2.5rem,5vh,3rem)] px-4 text-sm disabled:opacity-50"
            >
              다음
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={loading || !currentAnswer || answeredCount !== questions.length}
              className="btn-primary h-[clamp(2.5rem,5vh,3rem)] px-4 text-sm disabled:opacity-50"
            >
              {loading ? "저장 중..." : "자가진단 결과 보기"}
            </button>
          )}
        </div>
        {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
      </section>

    </section>
  );
}
