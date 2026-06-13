# LOOP.md

이 저장소에서 반복적으로 돌리는 점검 루프 3종. `CONTEXT.md`(아키텍처/배포), `CLAUDE.md`(코드 가이드)와 함께 사용.

## 1. 빌드 루프

코드 변경 후 항상 실행:

1. `npm run build` 실행
   - 실패 시: 에러 메시지 기준으로 원인(타입 에러, 누락된 import, env 참조, `maxDuration` 범위 등) 수정 → 1번부터 재시도
   - 통과 시: 2번으로
2. `npm run harness:all` 실행
   - 실패 항목이 있으면 해당 테스트가 가리키는 파일/구조를 수정 → 2번부터 재시도(빌드를 깨뜨릴 수 있는 변경이면 1번부터)
   - 통과 시 완료

이 루프는 "Builder returned invalid maxDuration value"류의 Vercel 빌드 에러 재발을 `tests/harness/api.test.ts`로 미리 잡기 위한 것이다.

## 2. 검증 루프 (정합성 교차 확인)

문서·코드·테스트 4곳이 서로 어긋나지 않는지 주기적으로 교차 확인:

1. **`CONTEXT.md`** — 서브도메인 라우팅 표(hq/report/agent/contents), 신규 Supabase 테이블 목록(025, 026)
2. **실제 코드** — `src/app/hq/{layout,page,login/page}.tsx`, `src/app/report/{layout,page}.tsx`, `src/app/agent/{layout,page}.tsx`, `src/app/contents/{layout,page}.tsx`, `src/app/blog/{page,[slug]/page}.tsx`, `src/middleware.ts`(host 분기), `src/lib/service-journey.ts`(`/blog` 공개 경로), `supabase/migrations/025_youtube_pipeline_and_hq.sql`, `supabase/migrations/026_content_command_center.sql`
3. **`tests/harness/*.test.ts`** — domains.test.ts/db.test.ts가 위 1·2의 항목들을 실제로 검사하는지
4. **`CLAUDE.md`** — Route structure 표, Supabase 마이그레이션 표, Key lib files 표, AI Command Center/콘텐츠 마케팅 사령부 섹션, 환경변수 표가 1·2와 일치하는지 (예: `/admin/command-center` 같은 제거된 경로가 남아있지 않은지)

네 곳 중 하나라도 변경되면(신규 라우트 추가, 테이블 추가, 경로 이동 등) 나머지 세 곳도 함께 갱신한다.

## 3. 운영 루프 (배포 후)

배포 후 주기적으로 점검:

- **크론**: `/api/cron/morning-report`가 `vercel.json`의 두 스케줄(최초 1회 + 매주 토요일 08:00 KST)에 맞춰 정상 실행되는지, `maxDuration`이 1~300 범위인지(harness:api가 정적으로 보장)
- **서브도메인 접속**: `https://hq.dkansim.com`(로그인 → 사령부 회의/피드백/콘텐츠 승인), `https://report.dkansim.com`(로드맵 진행률 + 승인된 보고서 아카이브), `https://agent.dkansim.com`(AI 파이프라인 모니터), `https://contents.dkansim.com`(콘텐츠 승인 대시보드)이 각각 정상 응답하는지, `dkansim.com`에서 로그인한 세션으로 전부 인증되는지
- **이메일 보고**: `REPORT_EMAIL`로 주간 보고 메일이 도착하는지, 메일 내 "관리자 사령부" 링크가 `hq.dkansim.com`을 가리키는지, 콘텐츠 마케팅 성과/승인 대기 섹션이 포함되는지
- **공개 블로그**: `https://dkansim.com/blog`, `/blog/[slug]`(게시된 글)이 인증 없이 열리는지, `/sitemap.xml`에 게시된 글 URL이 포함되는지

### 파이프라인 헬스체크 — 유튜브/Gemini 인사이트 (Task 4-5)

- `pipeline_logs` 테이블에서 `youtube-collect`/`youtube-analyze` 최근 실행의 `status`(started/success/failed) 확인
- `agent_logs`에서 `level=error` 항목 모니터링
- `youtube_videos`/`youtube_insights` 적재량이 기대치만큼 늘고 있는지 `/agent`에서 확인
- GitHub Actions(`.github/workflows/youtube-transcripts.yml`)가 매일 정상 실행되는지, yt-dlp 자막 수집 단계 실패 여부

### 파이프라인 헬스체크 — 콘텐츠 마케팅 사령부

- `pipeline_logs`에서 `content-plan`/`content-draft`/`content-approval-notify` 최근 실행 `status` 확인 (월/화/수, KST 기준)
- `/contents`에서 유튜브/카카오/블로그 승인 대기 큐가 쌓이지 않고 주기적으로 처리되는지
- `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`, `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`, `KAKAO_ACCESS_TOKEN` 미설정 시 해당 기능이 "설정 필요" 메시지로 안전하게 비활성화되는지(타 기능에 영향 없는지)
- 블로그 승인 → `dkansim.com/blog/[slug]`에 실제로 노출되는지
