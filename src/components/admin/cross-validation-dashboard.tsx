import { requireAgentSupabase } from "@/lib/agent-db";

type ValidationLog = {
  id: string;
  created_at: string;
  level: string;
  message: string;
  meta: {
    type?: string;
    target?: string;
    score?: number;
    passed?: boolean;
    verdict?: string;
  };
};

async function loadValidationLogs(): Promise<ValidationLog[]> {
  try {
    const supabase = requireAgentSupabase();
    const { data } = await supabase
      .from("agent_logs")
      .select("id, created_at, level, message, meta")
      .eq("source", "cross_validator")
      .order("created_at", { ascending: false })
      .limit(20);
    return (data ?? []) as ValidationLog[];
  } catch {
    return [];
  }
}

function scoreColor(score: number) {
  if (score >= 90) return "text-green-700";
  if (score >= 70) return "text-amber-700";
  return "text-red-700";
}

function typeLabel(type: string) {
  return { content: "콘텐츠", rag_answer: "RAG 답변", knowledge_chunk: "지식 청크" }[type] ?? type;
}

export default async function CrossValidationDashboard() {
  const logs = await loadValidationLogs();

  return (
    <div>
      <h2 className="mb-3 text-lg font-black text-slate-900">최근 교차검증 이력</h2>
      <p className="mb-4 text-xs text-slate-500">
        Gemini가 Claude 생성 결과를 자동 검증한 기록입니다. (agent_logs · source=cross_validator)
      </p>

      {logs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-8 text-center text-sm text-slate-400">
          아직 검증 기록이 없습니다.{" "}
          <span className="text-xs">GEMINI_API_KEY를 Vercel 환경변수에 설정하면 자동 검증이 시작됩니다.</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-bold text-slate-500">
                <th className="px-4 py-2.5 text-left">대상</th>
                <th className="px-4 py-2.5 text-left">유형</th>
                <th className="px-4 py-2.5 text-center">점수</th>
                <th className="px-4 py-2.5 text-center">판정</th>
                <th className="px-4 py-2.5 text-left">일시</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const score = log.meta?.score ?? 0;
                const passed = log.meta?.passed ?? false;
                const target = log.meta?.target ?? log.message;
                const type = log.meta?.type ?? "-";
                const ts = new Date(log.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
                return (
                  <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-slate-800">{target}</td>
                    <td className="px-4 py-2.5 text-slate-600">{typeLabel(type)}</td>
                    <td className={`px-4 py-2.5 text-center font-bold ${scoreColor(score)}`}>{score}점</td>
                    <td className="px-4 py-2.5 text-center">
                      {passed ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">✅ 통과</span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">⚠️ 검토필요</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{ts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
