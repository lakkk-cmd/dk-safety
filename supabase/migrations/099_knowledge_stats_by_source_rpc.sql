-- /admin/knowledge 학습 현황 대시보드가 정렬 없이 raw 행을 fetch해 PostgREST의 기본 행 개수
-- 상한(1,000)에 걸려, source별 실제 청크 수보다 훨씬 적게(때로는 0으로) 집계하던 버그를 고친다
-- (2026-08-17 실사례: 행정업무운영편람 614청크가 실제로는 전부 저장됐는데 대시보드엔 21청크로
-- 표시됨 — knowledge 테이블 전체 행 수(5,195)가 상한을 넘어 정렬 없는 조회 결과가 임의로 잘렸었음).
-- DB에서 미리 GROUP BY 집계해 반환하므로 행 개수 상한과 무관하게 항상 정확하다.
CREATE OR REPLACE FUNCTION knowledge_stats_by_source()
RETURNS TABLE(source text, chunk_count bigint, last_learned timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT source, count(*) AS chunk_count, max(created_at) AS last_learned
  FROM knowledge
  WHERE embedding_voyage IS NOT NULL
  GROUP BY source
  ORDER BY last_learned DESC;
$$;
