-- 054의 시드 INSERT가 ON CONFLICT DO NOTHING을 걸어뒀지만 실제 UNIQUE 제약이 없어
-- 무의미했고, npm run db:apply를 반복 실행할 때마다 (category, name)이 같은 행이 계속
-- 쌓였다. 여기서 기존 중복을 정리한다 — 이 삭제는 남는 중복이 없어지면 이후 재실행 시
-- 자동으로 아무 일도 하지 않는(멱등한) no-op이 된다.
DELETE FROM public.project_features a
USING public.project_features b
WHERE a.ctid < b.ctid
  AND a.category = b.category
  AND a.name = b.name;
