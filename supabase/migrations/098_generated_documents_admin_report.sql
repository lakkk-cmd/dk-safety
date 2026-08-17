-- 내부 업무보고서(행정업무운영편람 간이기안문 양식) 문서유형 추가 — 053에서 견적서/계약서 등
-- 대고객 문서 6종만 허용했던 CHECK 제약을 admin_report까지 허용하도록 넓힌다.
ALTER TABLE generated_documents DROP CONSTRAINT generated_documents_doc_type_check;
ALTER TABLE generated_documents ADD CONSTRAINT generated_documents_doc_type_check
  CHECK (doc_type IN ('inspection_report', 'estimate', 'completion_cert', 'safety_guide', 'contract', 'proposal', 'admin_report', 'custom'));
