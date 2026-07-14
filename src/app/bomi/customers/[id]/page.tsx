import { notFound } from "next/navigation";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { getBomiCustomer, listBomiCoverageAnalyses, listBomiDocuments } from "@/lib/bomi-db";
import { createSignedObjectUrl } from "@/lib/supabase-server";
import CustomerActions from "./customer-actions";
import DocumentUploadPanel from "./document-upload-panel";

const BOMI_DOCUMENTS_BUCKET = process.env.SUPABASE_BOMI_DOCUMENTS_BUCKET?.trim() || "dk-bomi-documents";

const OCR_STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  processing: "분석 중",
  done: "완료",
  failed: "실패"
};

export default async function BomiCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isAgentSupabaseReady()) {
    return (
      <div className="surface-card mt-6 rounded-2xl p-6 text-sm text-slate-600">
        Supabase가 설정되지 않았습니다.
      </div>
    );
  }

  const { id } = await params;
  const customer = await getBomiCustomer(id);
  if (!customer) {
    notFound();
  }

  const [documents, analyses] = await Promise.all([listBomiDocuments(id), listBomiCoverageAnalyses(id)]);
  const documentsWithUrls = await Promise.all(
    documents.map(async (doc) => {
      try {
        return { ...doc, viewUrl: await createSignedObjectUrl(BOMI_DOCUMENTS_BUCKET, doc.url, 600) };
      } catch {
        return { ...doc, viewUrl: null as string | null };
      }
    })
  );
  const latestAnalysis = analyses[0] ?? null;

  return (
    <div className="space-y-6 py-6">
      <div className="surface-card-strong rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-kicker">고객카드</p>
            <h1 className="mt-3 text-2xl font-bold text-slate-950">{customer.name}</h1>
          </div>
          <CustomerActions customerId={id} customerName={customer.name} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-400">연락처</dt>
            <dd>{customer.phone || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">생년월일</dt>
            <dd>{customer.birthDate || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">성별</dt>
            <dd>{customer.gender || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">직업</dt>
            <dd>{customer.occupation || "-"}</dd>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-xs text-slate-400">주소</dt>
            <dd>{customer.address || "-"}</dd>
          </div>
        </dl>
        {customer.familyNote ? <p className="mt-3 text-sm text-slate-600">가족사항: {customer.familyNote}</p> : null}
        {customer.financialNote ? <p className="mt-1 text-sm text-slate-600">재무정보: {customer.financialNote}</p> : null}
        {customer.memo ? <p className="mt-1 text-sm text-slate-600">메모: {customer.memo}</p> : null}
      </div>

      <div className="surface-card rounded-2xl p-6">
        <h2 className="text-lg font-bold text-slate-950">문서 캐비닛</h2>
        <p className="mt-1 text-sm text-slate-500">증권을 올리면 자동으로 OCR·보장분석까지 진행됩니다.</p>
        <DocumentUploadPanel customerId={id} />

        {documentsWithUrls.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">등록된 문서가 없습니다.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200">
            {documentsWithUrls.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <span className="font-semibold text-slate-800">{doc.docType}</span>
                  <span className="ml-2 text-slate-400">{doc.originalFilename}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{OCR_STATUS_LABEL[doc.ocrStatus] ?? doc.ocrStatus}</span>
                  {doc.viewUrl ? (
                    <a href={doc.viewUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary">
                      보기
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surface-card rounded-2xl p-6">
        <h2 className="text-lg font-bold text-slate-950">보장분석</h2>
        {!latestAnalysis ? (
          <p className="mt-3 text-sm text-slate-500">아직 분석 결과가 없습니다. 증권을 업로드하면 자동 생성됩니다.</p>
        ) : (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-slate-700">{latestAnalysis.summary}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-400">
                    <th className="pb-2 pr-4">카테고리</th>
                    <th className="pb-2 pr-4">가입금액</th>
                    <th className="pb-2">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(latestAnalysis.categoryCoverage).map(([category, value]) => {
                    const v = value as { amount: number | null; note: string };
                    return (
                      <tr key={category} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-semibold text-slate-800">{category}</td>
                        <td className="py-2 pr-4 tabular-nums text-slate-700">
                          {v.amount ? `${v.amount.toLocaleString("ko-KR")}원` : "-"}
                        </td>
                        <td className="py-2 text-slate-500">{v.note || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">과부족 진단</h3>
              <ul className="mt-2 space-y-1">
                {(latestAnalysis.gaps as Array<{ category: string; level: string; note: string }>).map((gap, i) => (
                  <li key={`${gap.category}-${i}`} className="text-sm text-slate-600">
                    <span
                      className={
                        "mr-2 rounded-full px-2 py-0.5 text-xs font-semibold " +
                        (gap.level === "부족"
                          ? "bg-rose-100 text-rose-700"
                          : gap.level === "충분"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600")
                      }
                    >
                      {gap.level}
                    </span>
                    <span className="font-semibold">{gap.category}</span> — {gap.note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
