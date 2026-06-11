# CONTEXT.md

운영자(대장)·향후 작업자를 위한 아키텍처 요약 + 배포 체크리스트. 코드 수준 가이드는 `CLAUDE.md`, AI 사령부 운영은 `docs/AGENT_COMMAND_CENTER.md` 참고.

## 1. 한 줄 요약

**대경안심전기**(dkansim.com)는 단일 Next.js 15 앱으로, 메인 사이트(`dkansim.com`)·경영 사령부(`hq.dkansim.com`)·주간 보고 아카이브(`report.dkansim.com`) 세 서브도메인을 **하나의 Vercel 배포**에서 미들웨어 host 라우팅으로 서빙한다.

## 2. 서브도메인 라우팅 구조

`src/middleware.ts`가 요청의 `Host` 헤더를 보고 내부 경로를 재작성(rewrite)한다. 브라우저 주소창의 URL은 그대로 유지되고, Next.js 라우팅만 아래처럼 내부적으로 바뀐다.

| 외부 호스트 | 외부 경로 (브라우저) | 내부 라우팅 경로 | 비고 |
|---|---|---|---|
| `dkansim.com` (또는 호스트 prefix 없음) | `/admin/...` | `/admin/...` | 변경 없음 |
| `hq.dkansim.com` | `/` | `/hq` | AI 경영 사령부 |
| `hq.dkansim.com` | `/login` | `/hq/login` | 사령부 로그인 |
| `report.dkansim.com` | `/` | `/report` | 주간 보고 아카이브 |

- 정적 파일 요청(`/\.[^/]+$/`에 매칭, 예: `/favicon.ico`, `/uploads/...`)은 host 재작성 이전에 그대로 통과시켜 `/public` 자산이 깨지지 않도록 한다.
- `hq`/`report`는 admin 인증 게이트(`dk_admin_auth=ok`)를 공유한다. `/report`는 자체 로그인 페이지가 없으므로 미인증 시 `hq.dkansim.com/login`으로 리다이렉트(`?next=` 포함)한다.
- 로컬 개발에서는 DNS 없이 Host 헤더를 바꿔 테스트 가능:
  ```bash
  curl -H "Host: hq.dkansim.com" http://localhost:3000/
  curl -H "Host: hq.dkansim.com" http://localhost:3000/login
  curl -H "Host: report.dkansim.com" http://localhost:3000/
  ```
  또는 dev 서버에서 직접 `/hq`, `/hq/login`, `/report` 경로로도 접근 가능(둘 다 동작하도록 레이아웃이 양쪽 경로를 처리).

## 3. 배포 체크리스트 (대장이 직접 진행)

이 저장소의 코드 변경만으로는 서브도메인이 동작하지 않는다. Vercel 프로젝트에 도메인을 추가하고 DNS를 연결해야 한다.

1. **Vercel 대시보드** → 해당 프로젝트 → **Settings → Domains**
2. `hq.dkansim.com` 추가 → Vercel이 안내하는 DNS 레코드(보통 `CNAME hq → cname.vercel-dns.com`)를 도메인 등록업체(예: 가비아, Cloudflare)에 등록
3. `report.dkansim.com`도 동일하게 추가 + CNAME 등록
4. 두 서브도메인 모두 **같은 Vercel 프로젝트**를 가리켜야 한다 (별도 프로젝트 생성 X) — 코드가 단일 배포 안에서 미들웨어로 라우팅을 분기하기 때문
5. DNS 전파 후 `https://hq.dkansim.com`, `https://report.dkansim.com` 접속 → `/admin/login`(메인 도메인)에서 로그인한 쿠키(`dk_admin_auth`, `domain=.dkansim.com`)가 두 서브도메인에서도 인증되는지 확인
6. (선택) `https://hq.dkansim.com/login`에서 직접 로그인도 가능 — `/api/admin/login`을 그대로 사용

> 쿠키 도메인 공유는 `NODE_ENV=production`에서만 `domain: ".dkansim.com"`이 적용된다. 로컬 개발(`localhost`)에서는 host-only 쿠키로 동작하며 `/hq`, `/report` 경로 직접 접근 시에도 정상 인증된다.

## 4. 신규 Supabase 테이블 (마이그레이션 025)

`supabase/migrations/025_youtube_pipeline_and_hq.sql` — 향후 유튜브/Gemini 인사이트 파이프라인(Task 4·5, 코드 미구현)을 위한 사전 스키마 + hq 콘텐츠 승인 컬럼:

| 테이블/컬럼 | 용도 |
|---|---|
| `youtube_channels` | 모니터링할 유튜브 채널 목록 (channel_id UNIQUE) |
| `youtube_videos` | 채널별 영상 메타데이터 + 자막 (FK → youtube_channels) |
| `youtube_insights` | 영상별 Gemini 분석 결과 (FK → youtube_videos) |
| `agent_logs` | AI 에이전트 실행 로그 (level: debug/info/warn/error) |
| `pipeline_logs` | 파이프라인 실행 이력 (status: started/success/failed) |
| `agent_reports.approved`, `agent_reports.approved_at` | hq에서 "콘텐츠 승인"한 보고서 → report.dkansim.com 아카이브에 노출 |

> **알려진 이슈**: `npm run db:apply`는 마이그레이션 021(`electrical_tips`)의 `CREATE POLICY`가 비-idempotent(`IF NOT EXISTS` 미지원)라 이미 정책이 존재하면 거기서 실패한다. 001부터 전부 재실행하는 구조라 022~025는 표준 스크립트로 재적용 불가 — 025는 1회성 스크립트로 직접 적용·검증했다. 021 자체는 이번 작업 범위 밖이라 수정하지 않았다.

## 5. 신규/예정 환경변수

`.env.example` 참고. 새로 추가된 항목:

| 변수 | 상태 | 용도 |
|---|---|---|
| `GEMINI_API_KEY` | placeholder만 추가, 코드 미구현 | Task 4-5 (유튜브 인사이트 파이프라인용 Gemini API) |
| `YOUTUBE_API_KEY` | placeholder만 추가, 코드 미구현 | Task 4-5 (유튜브 데이터 수집) |

이 두 키는 값이 비어 있어도 현재 빌드/배포에 영향 없음. Task 4-5 구현 시 채워 넣을 것.

## 6. 쿠키 도메인 공유 전제

- `src/app/api/admin/login/route.ts`, `src/app/api/admin/logout/route.ts`, `src/middleware.ts`(첫 방문 시 쿠키 삭제) 모두 운영(`NODE_ENV=production`)에서 `dk_admin_auth`/`dk_first_visit_checked` 쿠키에 `domain: ".dkansim.com"`을 설정한다.
- 이를 통해 `dkansim.com`에서 로그인하면 `hq.dkansim.com`, `report.dkansim.com`에서도 같은 세션으로 인증된다.
- 도메인 속성이 빠지면(예: 코드 회귀) host-only 쿠키가 되어 서브도메인에서 인증이 풀린다 — 회귀 시 우선 의심할 지점.
