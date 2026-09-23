# HANDOFF: 경로 A 본작업·배포 완료 (IT·디지털팀)

날짜: 2026-09-22 22:45 KST
상태: **완료**

## 한 일
1. `src/lib/unit-inspection-pdf-issue.ts` — PathA page1 + AI v2 page2 merge, 스탬프 폰트(맑은고딕 우선 / NanumGothic 번들)
2. `document-pdf.tsx` `renderUnitInspectionPdf` → PathA만 (동적 import)
3. 로컬 `npm run build` 통과
4. PR #40 → `main` 병합 → Vercel production 배포 성공

## 배포 결과
- URL: https://dkansim.com
- PR: https://github.com/lakkk-cmd/dk-safety/pull/40
- 커밋(main): `8164faac282a81bf347220f831337ddeff376a02` (short `8164faa`)
- Vercel: Deployment has completed (success)
- 대시보드: https://vercel.com/lakkk-1934s-projects/dk-safety/HGxBiPf8TKz129tWkGdiJYVcAVf9

## 잔여
- AI generate 네이티브 v2 JSON은 어댑터로 우회 중(고도화 가능)
- 고정영역 마스크 자동화 미포함
- 프로덕션 방문/미방문 PDF 1회 스모크는 운영 확인 권고

시크릿 노출·결제·불가역 삭제 없음. 대표 재승인 요청 없음.

## 확인 (Claude Code, 로컬)
- 2026-09-22 22:53 KST — origin/main 커밋 `8164faa`(PR #40 merge) 존재 확인(`git fetch`+`git log origin/main`), `gh pr view 40` → state=MERGED 확인, `https://dkansim.com/` 응답 확인(HTTP 307, 정상). 새 작업·재배포 없음.

---

## Path A 회귀 수정 (2026-09-23, Claude Code — 로컬만, 배포·main 병합 안 함)

### 신고 증상
사인(세대방문점검 서명) 후 (1) 세대 문자(SMS/알림톡) 미전송, (2) 점검표 PDF 다운로드 불가.

### 원인 (재현·확정)
`e7d25a0`(경로 A 연결 커밋)이 도입한 `src/lib/unit-inspection-pdf-issue.ts` /
`unit-inspection-pdf-path-a.ts`는 고시 원본 템플릿(`public/templates/unit-inspection-form-gazette-original.pdf`)과
스탬프 폰트(`public/fonts/NanumGothic-Regular.ttf`)를 `fs.readFileSync(path.join(process.cwd(), ...))`로 읽는다.
이 코드는 `document-pdf.tsx`가 `await import("@/lib/unit-inspection-pdf-issue")`로 **동적 import**하는
모듈 안에 있는데, Next.js `output: "standalone"`의 파일 트레이싱(`@vercel/nft`)이 동적 import 뒤에 숨은
`fs.readFileSync` 리터럴 경로까지는 따라가지 못해 이 두 파일을 서버리스 함수 번들에서 빠뜨렸다
(이 저장소 `next.config.ts`가 `pdf-parse`/`pdfjs-dist`에 이미 같은 이유로 수동
`outputFileTracingIncludes`를 써온 것과 동일한 클래스의 문제).

**직접 재현 확인**: 수정 전 `npm run build` 산출물을 검사한 결과
`.next/standalone/public/fonts/`에 `NotoSansKR-Bold.woff`(다른 정적 import 경로에서 이미 트레이싱되던
파일)만 있고 `NanumGothic-Regular.ttf`는 없었으며, `.next/standalone/public/templates/` 디렉터리 자체가
없었다. 즉 프로덕션(Vercel)에서는 PDF 렌더링 시작 단계(`renderUnitInspectionPage1PathA`)에서 템플릿
파일 ENOENT로 예외가 발생한다.

이 예외가 `worker/apt-manager unit-inspections` POST 라우트의 **PDF 발급 + 문자 발송 + CRM 기록이
하나의 try 블록**에 묶여 있어서 그대로 전체 블록을 중단시켰다 — PDF 렌더링이 실패하면 그 아래 문자
발송·CRM 로그 코드 자체가 한 줄도 실행되지 않았다. 이것이 "사인 후 문자 미전송"의 직접 원인이다.
동시에 PDF 렌더링 실패로 `pgSaveUnitInspectionPdf`가 호출되지 않아 `pdf_url`이 계속 null로 남고,
전기과장 다운로드 게이트(`GET /api/apt-manager/unit-inspections/[id]/pdf`)는 `pdf_url`이 없으면 무조건
"PDF가 아직 발급되지 않았습니다"(404)를 반환한다 — "PDF 다운로드 불가"의 직접 원인.

로컬(Windows)에서는 `C:\Windows\Fonts\malgun.ttf`가 항상 존재해 폰트 후보 목록의 첫 항목에서 바로
성공하므로 이 버그가 로컬에서는 전혀 재현되지 않았다(빌드/린트/로컬 서버 모두 통과했던 이유).

### 수정 내용
1. **`next.config.ts`**: `outputFileTracingIncludes`에 `/api/worker/unit-inspections`,
   `/api/apt-manager/unit-inspections`, `/api/admin/unit-inspections/[id]/pdf`,
   `/api/admin/unit-inspections/[id]/reissue-pdf` 4개 라우트를 추가하고, 고시 템플릿 PDF +
   NanumGothic + NotoSansKR-Bold를 명시적으로 포함시켰다.
2. **자산 로드 보강**: `unit-inspection-pdf-path-a.ts`(템플릿)와 `unit-inspection-pdf-issue.ts`(폰트)에
   `existsSync` 사전 확인 + 어떤 경로를 시도했는지 담은 에러 메시지를 추가했다 — 같은 클래스의 문제가
   재발해도 원인 파악이 즉시 되도록(막연한 ENOENT 대신 "배포 번들에 public/templates가 포함됐는지
   확인" 같은 구체적 메시지).
3. **PDF/문자 try 분리**: `src/app/api/worker/unit-inspections/route.ts`,
   `src/app/api/apt-manager/unit-inspections/route.ts` 둘 다 PDF 발급(렌더+업로드+저장+AI사후보정
   등록)과 문자 발송+CRM 기록을 **완전히 독립된 try/catch**로 분리했다. 이제 PDF 발급이 실패해도
   문자는 독립적으로 시도되고, 반대의 경우도 서로 영향을 주지 않는다.
4. **경로 A 0% 유지**: 스탬프 좌표·폰트 크기·격자·문구 등 경로 A의 렌더링 로직 자체는 전혀 건드리지
   않았다 — 변경은 자산 트레이싱/에러 메시지/에러 격리뿐.

### 검증
- `npm run build`를 수정 전/후 두 번 비교 실행 — **수정 전**: `.next/standalone/public/fonts/`에
  NanumGothic 없음, `.next/standalone/public/templates/` 디렉터리 자체 없음(재현 확인).
  **수정 후**: 두 파일 모두 `.next/standalone/public/{fonts,templates}/`에 정상 포함 확인.
- 수정 후 전체 빌드(모든 코드 변경 포함) 재실행 — `exit code 0`, TypeScript/webpack 에러 없음,
  `/api/worker/unit-inspections` 라우트 정상 컴파일 확인.
- `npm run lint` — 에러 0건, 이번에 수정한 파일들에는 경고도 없음(기존 무관 파일의 기존 경고만 존재).
- 스탠드얼론 빌드 산출물 직접 검사로 트레이싱 포함 여부를 확인했고(위), 별도로 로컬에서
  `renderUnitInspectionPage1PathA`를 프로덕션과 동일하게 NanumGothic 폰트만으로(malgun.ttf 우회)
  직접 호출해 PDF 바이트가 정상 생성됨을 확인했다(110,671 bytes).
- **미검증(범위 밖)**: 실제 Vercel 프로덕션 재배포 후 문자 수신·다운로드 성공 여부 — 이번 지시
  ("배포·main merge 금지")에 따라 배포는 하지 않았다. main 병합·배포 승인 후 실제 세대방문점검
  1건으로 문자 수신 + 전기과장 PDF 다운로드 스모크 테스트를 권고한다.

### 변경 파일
- `next.config.ts`
- `src/lib/unit-inspection-pdf-issue.ts`
- `src/lib/unit-inspection-pdf-path-a.ts`
- `src/app/api/worker/unit-inspections/route.ts`
- `src/app/api/apt-manager/unit-inspections/route.ts`

### 배포 결과 (2026-09-23 02:14 KST, 대표 지시로 진행)
- PR: https://github.com/lakkk-cmd/dk-safety/pull/41 (MERGED)
- CI: build pass, gemini-review pass, cursor-review pass, Vercel Preview pass — 전부 통과 확인 후 병합
- 커밋(main): `119123a009b56cb74da4cd202a64686183d6e73b` (short `119123a`, PR #41 머지 커밋)
- Vercel production 배포: Ready 확인(`dk-safety-e9etd3249-lakkk-1934s-projects.vercel.app`)
- `https://dkansim.com/`, `https://dkansim.com/apt-manager/login` 응답 200 확인
- **잔여**: 실제 세대방문점검 1건으로 문자 수신 + 전기과장 PDF 다운로드 스모크 테스트는 아직
  미실시(운영 중 실제 케이스로 확인 권고) — 코드 수준 검증(빌드 산출물 트레이싱 비교, PDF 바이트
  생성)은 완료했으나 프로덕션 Solapi 발송·실사용자 다운로드까지는 이 세션에서 트리거하지 않았다.

시크릿 노출·결제·불가역 삭제 없음.
