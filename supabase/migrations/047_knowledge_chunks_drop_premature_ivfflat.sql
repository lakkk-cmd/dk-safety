-- 046에서 만든 ivfflat 인덱스(lists=100)가 데이터가 거의 없는 테이블에 생성되어
-- 클러스터링이 무의미해졌고, 그 결과 match_chunks가 실제로 존재하는 매치를 못 찾고
-- 항상 빈 배열을 반환하는 문제가 실측으로 확인됨(생성 시 "low recall" NOTICE도 있었음).
-- 데이터가 충분히 쌓이기 전까지는 시퀀셀 스캔이 정확하고 이 규모에서는 충분히 빠르다.
-- 나중에 행이 많이 쌓이면(수만 건 이상) 다시 만들 것 — pgvector 권장사항: 빈 테이블에
-- 인덱스를 만들지 말고 데이터가 어느 정도 쌓인 뒤에 생성할 것.
DROP INDEX IF EXISTS knowledge_chunks_embedding_idx;
