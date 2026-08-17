-- 주간 경영진 회의 보고서를 행정업무운영편람 간이기안문(별지 제2호서식) 양식 PDF로도 저장할 수 있게
-- pdf_url 컬럼을 추가한다. NULL 허용 — PDF 생성이 실패해도 이메일/카카오 발송 자체는 막지 않는다.
ALTER TABLE agent_reports ADD COLUMN IF NOT EXISTS pdf_url text;
