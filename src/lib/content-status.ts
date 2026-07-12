// content_youtube_queue는 "draft"/"pending"으로 전이·조회하는 코드 경로가 없다(둘 다 다른
// 파이프라인 단계에서만 쓰이던 값의 잔재) — 포함시키면 한 번도 초안 작성되지 않은 채 방치된
// 행까지 승인대기로 잘못 집계된다(2026-07-05 실사례: 이 값 때문에 실제 3건인 승인대기가
// 23건으로 표시됨). content-pipeline.ts(카운트)와 blog-store.ts(목록)가 같은 기준을
// 쓰도록 별도 파일로 분리 — 두 모듈이 서로를 import하는 순환참조를 피하기 위함.
export const YOUTUBE_APPROVAL_STATUSES = ["pending_approval", "review_required"];
export const KAKAO_BLOG_APPROVAL_STATUSES = ["draft", "pending", "pending_approval", "review_required"];
