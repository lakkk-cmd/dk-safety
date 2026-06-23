import AdminPageHeader from "@/components/admin/admin-page-header";
import KnowledgeUploadCenter from "@/components/admin/knowledge-upload-center";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { pgListKnowledgePdfs } from "@/lib/knowledge-pdfs";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgePage() {
  const ready = isAgentSupabaseReady();
  const pdfs = ready ? await pgListKnowledgePdfs().catch(() => []) : [];

  return (
    <main className="page-fit max-w-6xl">
      <AdminPageHeader
        title="지식베이스 관리"
        description="PDF를 끌어다 놓으면 AI가 카테고리를 자동 판단해 분류·학습합니다. 사람이 할 일은 PDF를 올리는 것뿐입니다."
      />
      {!ready ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Supabase가 설정되지 않아 지식베이스를 사용할 수 없습니다.
        </p>
      ) : (
        <KnowledgeUploadCenter initialPdfs={pdfs} />
      )}
    </main>
  );
}
