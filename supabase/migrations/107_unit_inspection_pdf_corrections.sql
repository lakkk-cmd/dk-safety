-- 세대전기점검표 PDF는 발급(pdf_url 채워짐) 후 전기안전관리법 제24조 4년 보존 요건에 따라
-- unit_electrical_inspections 행 자체가 불변(트리거로 UPDATE 차단)이다. 그래서 발급 후 문구를
-- 다시 다듬어야 하는 경우(2026-08-24), 원본 행은 절대 건드리지 않고 이 별도 테이블에
-- "이 건의 최신 안내용 PDF는 이 파일이다"라는 포인터만 남긴다. 관리자 화면은 이 테이블에 값이
-- 있으면 그것을 그 건의 대표 PDF로 보여주고(구버전 원본 링크는 화면에서 감춤), 없으면 원본을
-- 그대로 보여준다 — 법적 원본은 항상 unit_electrical_inspections.pdf_url이다.
create table if not exists public.unit_inspection_pdf_corrections (
  inspection_id uuid primary key references public.unit_electrical_inspections (id) on delete cascade,
  corrected_pdf_url text not null,
  created_at timestamptz not null default now()
);

comment on table public.unit_inspection_pdf_corrections is
  '발급 후 문구 정정이 필요했던 세대전기점검표의 최신 안내용 PDF 포인터. 법적 원본(불변)은 여전히 unit_electrical_inspections.pdf_url이며, 이 테이블은 그 위에 얹는 화면 표시용 오버레이일 뿐이다.';

alter table public.unit_inspection_pdf_corrections enable row level security;
