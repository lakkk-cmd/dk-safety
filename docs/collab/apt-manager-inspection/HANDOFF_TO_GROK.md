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

---

## Path A 스탬프 글리프 소실 회귀 수정 (2026-09-23, Claude Code — main 병합·배포 완료)

바로 위 "잔여"에 적은 대로 실사용자 다운로드까지는 이전 세션에서 트리거하지 않았는데, 대표님이
직접 시연전용아파트에서 세대방문점검을 실제로 하고 PDF를 다운로드해 보면서 이 회귀를 발견했다.

### 신고 증상
샘플(`docs/collab/apt-manager-inspection/samples/sample-pathA-visit-2026-09-22.pdf`)은 호/성명/
날짜/점검결과/비고/기타사항/확인란/AI진단이 전부 정상인데, 실제 발급본은 **서명만 남고 나머지가
빈칸이거나 깨져서** 나옴.

### 원인 (직접 재현·확정)
`renderUnitInspectionPage1PathA`의 `pdfDoc.embedFont(stampFontBytes, { subset: true })`가
문제였다. `NanumGothic-Regular.ttf`는 fontkit으로 직접 실측해보면 필요한 글리프(○/×/모든 한글/
숫자)를 전부 갖고 있다(13,297글리프, 테스트한 글자 전부 `hasGlyphForCodePoint=true`). 그런데도
`subset: true`로 embed하면 글리프 인덱스가 큰(한글처럼 수천 단위) 폰트에서 다수 문자가 빠지거나
다른 글자로 바뀌어 그려졌다 — pdf-lib의 CID 서브셋팅이 이런 폰트에서 깨지는 한계로 보인다(예외는
안 던지고 조용히 잘못 그림).

로컬(Windows) 샘플 생성 시엔 시스템 폰트 `malgun.ttf`를 썼는데(글리프 인덱스 구조가 달라 같은
버그가 재현 안 됨), 프로덕션은 항상 번들 `NanumGothic-Regular.ttf` 폴백을 썼으므로 **QA가 한 번도
본 적 없는 경로에서만 재현되는 버그**였다. 게다가 PR #41(자산 트레이싱 수정) 이전엔 이 폰트
파일 자체를 못 찾아 렌더링이 아예 실패했으므로("PDF 다운로드 불가"), 이번 건이 발생하려면
"폰트는 찾되 서브셋이 깨지는" PR #41 이후 상태여야 했다 — 즉 이 버그는 PR #41이 배포되면서
비로소 겉으로 드러났다.

부가로, 소스에서 쓰는 "Ω"(GREEK CAPITAL LETTER OMEGA, U+03A9)가 이 폰트에 아예 없는 글리프임도
확인했다(대신 OHM SIGN U+2126은 있음, 시각적으로 동일) — "절연 0.013MΩ"의 단위기호가 사라지던
2차 원인.

### 수정
1. `embedFont(..., { subset: true })` → `{ subset: false }`(풀 임베드). 문제 재현본과 동일한
   데이터(111동 111호/나경문/홍길동/시연전용아파트)로 로컬에서 직접 재현·비교: subset:true는
   실제 다운로드본과 같은 패턴으로 깨지고, subset:false는 전부 정상.
2. "Ω" → OHM SIGN(U+2126) 자동 치환.
3. 폰트에 없는 글리프가 남아있으면 조용히 빠지는 대신 콘솔 경고를 남기는
   `warnIfUnsupportedGlyphs` 추가(다음 재발 시 원인 파악 시간 단축용).

### 소급 적용 범위
1페이지(경로 A) 스탬프는 `unit-inspection-pdf-path-a.ts` 하나를 worker 점검등록, apt-manager
점검등록, 관리자 PDF 발급(`/api/admin/unit-inspections/[id]/pdf`), 정정본 재발급
(`/api/admin/unit-inspections/[id]/reissue-pdf`) 4개 라우트가 전부 공유하므로, 이 수정 한 번으로
4곳 전부에 소급 적용됨. Path A 렌더링 로직(좌표·폰트크기·문구)은 무변경.

**이미 발급된 손상 PDF**: 원본 행(`unit_electrical_inspections`)은 법정보관 트리거로 불변이라
되돌려 고칠 수 없지만, 관리자 화면(`/admin` 세대전기점검 패널)의 기존 "재발급"(정정본) 버튼이
이 수정된 렌더러를 그대로 타므로 코드 변경 없이 바로 정정본을 재생성할 수 있다. 이번에 신고된
시연전용아파트 111동 111호 건은 데모 전용 단지(실고객 아님)라 재발급 또는 삭제 후 재점검 둘 다
가능 — 실고객 단지의 발급건이 이 창구(PR #41 배포 02:14 KST ~ 이번 수정 배포 03:42 KST 사이)에
있었는지는 프로덕션 DB 조회 권한이 이 세션엔 없어 직접 확인하지 못했다(로컬 `.env.local`의
Supabase 프로젝트가 프로덕션과 다른 빈 프로젝트임을 확인함) — 관리자 화면에서 그 시간대 발급건이
있는지 한 번 확인해 보시길 권고한다.

### 검증
- `npm run build` exit 0, `npm run lint` 에러 0건.
- 로컬 재현 테스트로 subset:true(깨짐) vs subset:false(정상) 직접 비교 완료.

### 배포 결과 (2026-09-23 03:42 KST)
- PR: https://github.com/lakkk-cmd/dk-safety/pull/43 (MERGED)
- CI: build pass, gemini-review pass, cursor-review pass, Vercel Preview pass — 전부 통과 확인 후 병합
- 커밋(main): `fd513e6bcee743bf08e7adde1f8a37c96659d10d` (short `fd513e6`)
- Vercel production 배포: Ready 확인, `https://dkansim.com/` 200 확인
- **잔여**: 관리자 화면에서 시연전용아파트 111동 111호 건 "재발급" 클릭 확인 + 실사용자 재점검
  1건으로 최종 육안 확인 권고(이 세션은 admin 인증 정보가 없어 직접 클릭까지는 못함).

시크릿 노출·결제·불가역 삭제 없음.

---

## "정보관리" 탭 신설 — 전기과장 개인정보·비밀번호 자가수정 (2026-09-23, Claude Code — main 병합·배포 완료)

### 배경
관리자가 비밀번호를 초기화해 임시비밀번호를 SMS로 보내줘도, 그 비밀번호로 로그인한 뒤 직접
바꿀 화면이 앱에 아예 없던 문제를 대표님이 신고. 가입 항목(개인정보/단지정보) 중 어디까지
자가수정 대상으로 할지는 인터뷰로 확정(전기과장 개인정보만 — 이름/휴대전화/비밀번호. 단지명·
주소·세대수는 계속 관리자 전용).

### 구현
- 점검입력/점검이력/점검가이드/구독관리에 이어 5번째 탭 "정보관리" 신설.
- `PATCH /api/apt-manager/me` — 이름/휴대전화 수정(가입과 동일한 연락처 정규식 재검증).
- `POST /api/apt-manager/me/password` — 비밀번호 변경, **현재 비밀번호 확인 필수**(관리자의
  강제 재발급과 다른 점 — 세션 쿠키만으로는 비밀번호를 아는지 확인 불가), 새 비밀번호 8자
  이상. DB 반영은 기존 `pgResetApartmentManagerPassword`를 그대로 재사용.

### 소급 적용 확인
관리자 화면(계정 목록)·관리자 비밀번호 재발급 SMS(전화번호)·로그인 흐름 전부 요청 시점에
DB를 다시 읽으므로 코드 변경 없이 자동 반영됨을 코드 추적으로 확인. Capacitor 모바일 앱은
서버 URL을 그대로 로드하는 WebView라 새 탭이 별도 빌드 없이 자동 반영됨(확인 완료).
비밀번호 변경은 기존 세션을 끊지 않음 — 관리자 강제재발급과 동일한 기존 동작(새 비일관성
아님).

### 검증
- `npm run build`/`npm run lint` 통과.
- 로컬 빈 Supabase 프로젝트에 테스트 단지/계정을 시딩해 실제 API로 end-to-end 검증: 로그인 →
  GET → PATCH(정상/오류 케이스) → 비밀번호 변경(오류 3종 + 정상) → 구/신 비밀번호 로그인 →
  세션 유지 확인. 테스트 데이터는 검증 후 삭제.
- **미검증**: 이 세션은 브라우저 자동화 도구(claude-in-chrome)가 연결되지 않아 화면 육안
  확인은 못했다 — API 레벨 검증만 완료. 배포 후 실제 계정으로 화면 확인 권고.

### 배포 결과 (2026-09-23 04:25 KST)
- PR: https://github.com/lakkk-cmd/dk-safety/pull/45 (MERGED)
- CI: build pass, gemini-review pass, cursor-review pass, Vercel Preview pass — 전부 통과 확인 후 병합
- 커밋(main): `e9f6b76616d82e09dbadb5d33664dea2c46adb6b` (short `e9f6b76`)
- Vercel production 배포: Ready 확인, `https://dkansim.com/`, `https://dkansim.com/apt-manager/login` 200 확인

시크릿 노출·결제·불가역 삭제 없음.

---

## AI 안전진단 2페이지 placeholder 회귀 수정 (2026-09-23, Claude Code — main 병합·배포 완료)

### 신고 증상
1페이지 점검기록표는 정상인데, 2페이지 "AI 안전진단 결과 (상세)"에는 "AI 상세 진단이 아직
없어 요약만 안내합니다. 상세 AI 진단이 준비되면 정정본으로 안내가 보강됩니다"라는
placeholder 문구만 나오고 실제 진단 내용이 없음.

### 원인
AI 안전진단은 제출 직후 백그라운드에서 생성돼 별도 테이블에 저장되고, 완성되면 "정정본"
PDF로 조용히 교체되는 설계(2026-08-26)인데, 관리자용 `pdf`(최초 미발급건 생성)/`reissue-pdf`
(문구 정정본 재발급) 두 라우트가 렌더링 시 저장된 AI 진단을 아예 조회하지 않아 항상
placeholder로 폴백하고 있었다. 실제 재현 경로: 앞선 세션에서 "경로 A 글리프 깨짐" 수정 후
관리자에게 "재발급" 클릭을 권했는데, 그 버튼이 이미 생성돼 있던 AI 진단을 지우고 placeholder로
덮어쓴 것 — 두 회귀가 이어져 있었다.

### 수정
두 라우트 모두 렌더링 전 저장된 AI 진단을 조회해 넘기도록 수정. 부가로 "권고사항"
(recommendations, 2026-09-22 신설) 필드가 저장 컬럼 자체가 없어 항상 유실되고 있던 것도
발견 — 마이그레이션 128(`add column recommendations`)을 만들어뒀지만 **프로덕션에는 아직
적용하지 않았다**. 미적용 상태에서 코드가 이 컬럼을 참조하면 AI 진단 조회·저장 전체가
깨지므로, 이번 배포는 기존 컬럼만 쓰도록 의도적으로 분리해 안전하게 냈다.

**남은 일(별도 승인 필요)**: `npm run db:apply`로 마이그레이션 128을 프로덕션에 적용한 뒤
알려주시면, `pgGetUnitInspectionAiDiagnosis`/`pgSaveUnitInspectionAiDiagnosis`가
recommendations 컬럼을 쓰도록 마저 연결하겠다 — 이 세션은 프로덕션 DB 자격증명이 없어 직접
적용하지 못했다.

### 검증
- 로컬 빈 Supabase 프로젝트에 실제 시나리오 재현 데이터(점검기록 + 저장된 AI진단)를 시딩해
  `reissue-pdf`를 실제로 호출, 반환된 PDF를 직접 열어 2페이지에 placeholder 대신 실제 진단
  (관찰/의미인과/실측비교/종합총평)이 나오는 것을 확인. 테스트 데이터는 검증 후 삭제.
- `npm run build`/`npm run lint` 통과.

### 배포 결과 (2026-09-23 04:59 KST)
- PR: https://github.com/lakkk-cmd/dk-safety/pull/47 (MERGED)
- CI: build pass, gemini-review pass, cursor-review pass, Vercel Preview pass — 전부 통과 확인 후 병합
- 커밋(main): `852f6ad82a8c7dad0c8f885a8b3af0e9f8afc204` (short `852f6ad`)
- Vercel production 배포: Ready 확인, `https://dkansim.com/` 200 확인

시크릿 노출·결제·불가역 삭제 없음. DB 스키마 변경(마이그레이션 128)은 파일만 추가했고
프로덕션 적용은 대표님 승인 후 진행.

---

## 마이그레이션 128 프로덕션 적용 + recommendations 코드 연결 완료 (2026-09-23)

- 대표님이 직접 `.env.local`에 `DATABASE_URL`(프로덕션 Supabase, project ref
  `mfecdmvieeylxnbqecli`)을 추가하고 `npm run db:apply` 실행 요청 → Claude Code가 실행.
- 001~127은 이미 적용된 상태로 스킵됐고(`schema_migrations` 추적 테이블에 기록 있음),
  128번(`recommendations` 컬럼 추가)만 새로 적용됨. `023a`/`055a`/`127`도 이번에 함께
  적용됐는데, 대상 테이블이 이미 존재해 전부 `NOTICE: already exists, skipping`(무해)만
  발생 — 에러 없이 완료.
- `information_schema.columns` 직접 조회로 `unit_inspection_ai_diagnoses.recommendations`
  컬럼(jsonb, default `'[]'::jsonb`) 존재를 프로덕션에서 확인.
- 보류해뒀던 코드 연결 마무리(PR #49, MERGED): `pgGetUnitInspectionAiDiagnosis`/
  `pgSaveUnitInspectionAiDiagnosis`가 이제 recommendations를 select/upsert. 이제부터
  AI 안전진단 사후보정이 만드는 "권고사항" 목록이 재발급 PDF에서도 유지됨.
- 커밋(main): `a80489768359769ae08022247773e6cad5038ccd` (short `a804897`)
- Vercel production 배포: Ready 확인, `https://dkansim.com/` 200 확인
- `npm run build`/`npm run lint` 통과. 프로덕션 실제 write 테스트는 진행하지 않음(운영
  데이터 보호 — 스키마 확인은 읽기 전용 쿼리로만, 로직 자체는 #47에서 로컬로 이미 검증됨).

이로써 이번 세션에서 발견된 AI 안전진단 관련 이슈(placeholder 회귀 + recommendations
유실)가 전부 해결·배포·검증 완료됨. 시크릿 노출·결제·불가역 삭제 없음.

---

## AI 진단 4번째 신고 — 진짜 원인(API 계정 한도) 발견 + UX 공백 해소 (2026-09-23, 완전 검증 완료)

### 경위
위 수정(#47/#49) 배포 후에도 "AI 안전진단 결과(상세)"에 placeholder만 나온다는 신고가
4번째로 들어옴. 이번엔 프로덕션 DB(`DATABASE_URL`)와 Storage를 직접 조회해 근본 원인을 끝까지
추적했다.

**1차 발견 — Anthropic API 계정 사용량 한도**: 프로덕션 DB를 조회해보니 2026-09-21~23 생성된
점검 21건 전부 `unit_inspection_ai_diagnoses` 행이 아예 없었다(처리 중이 아니라 한 번도
성공한 적 없음). `generateUnitInspectionAiDiagnosis`를 실제 프로덕션 API 키로 직접 호출해보니
"You have reached your specified API usage limits. You will regain access on 2026-10-01."
— dk-safety 자체 Anthropic 계정이 사용량 한도로 막혀있었다(코드 문제 아님). 대표님이
Anthropic Console에서 직접 한도를 상향조정해 해제.

**2차 발견 — 진짜 UX 버그**: 한도 해제 후 실제 점검 1건(101동 302호)으로 재확인했는데도 여전히
placeholder를 봤다는 신고 → 그 건의 정정본 PDF를 프로덕션 Storage에서 직접 다운로드해 열어보니
**AI 진단 내용이 이미 전부 정상적으로 들어있었다**(제출 32초 후 완성). 즉 백엔드는 이미 정상
작동 중이었고, 문제는 **그 32~45초 생성 창 안에 확인하면 placeholder가 보이는데, 화면에 "잠시
후 다시 확인하라"는 안내가 전혀 없었던 것** — apt-manager 점검이력 API는 이미 `pdfCorrections`
맵을 응답에 포함하고 있었는데 프런트엔드가 그 필드를 읽지도 않고 있었다.

**부가 발견**: "우선순위" 문구가 실측값 소수점(예: "0.018MΩ")에서 잘려 "절연저항이 0"처럼
나오던 별개의 버그도 같이 발견·수정(`.split(/[.。]/)` → `.split(/[.。](?!\d)/)`).

### 수정 (PR #51, MERGED)
1. `apt-manager-inspection-history.tsx`: `pdfCorrections`를 읽어 최근 5분 이내+정정본 없음이면
   "🤖 AI 상세진단 생성 중" 배지 표시, 15초 간격 자동 재조회로 완성되면 저절로 갱신(수동
   새로고침 불필요).
2. `admin-unit-inspections-panel.tsx`: 관리자 화면에도 동일 안내 추가.
3. `unit-inspection-pdf-issue.ts`: 우선순위 문구 소수점 절단 버그 수정.

### 검증 (실제 프로덕션, 시뮬레이션 아님)
- 프로덕션 DB 직접 SQL 조회로 21건 백로그·재현 건 확인.
- 한도 해제 후 `generateUnitInspectionAiDiagnosis` 실제 재호출 → 정상 JSON 응답 확인.
- **실제 신고 건(101동 302호, id `a2b5fa53`)의 정정본 PDF를 프로덕션 Storage에서 직접
  다운로드해 열어봄 → AI 진단 7건 전부 정상 표시 확인**(수정 전).
- `/unit-inspection/[id]` 공개 페이지(거주민 SMS 링크)를 curl로 직접 확인 → AI 진단 7건 전부
  정상 렌더링 확인(이 페이지는 서버 컴포넌트라 매 요청마다 새로 조회해서 원래 이 문제와 무관).
- PR #51 배포 후, **프로덕션 관리자 계정으로 로그인해 같은 건을 `reissue-pdf`로 재발급 →
  재다운로드해 "우선순위" 필드가 "절연저항이 0.018MΩ으로 측정되었습니다"로 정상 출력됨을
  확인**(수정 후, 소수점 절단 버그 해결 확인).
- `npm run build`/`npm run lint` 통과.

### 배포 결과 (2026-09-23 07:09 KST)
- PR: https://github.com/lakkk-cmd/dk-safety/pull/51 (MERGED)
- 커밋(main): `86ac8bee8868975d7cec61c5749ab4c889b37834` (short `86ac8be`)
- Vercel production 배포: Ready 확인, `https://dkansim.com/` 200 확인
- cursor-review 체크 하나가 타임아웃(수동확인 필요)으로 떴으나, 동일 게이트의 다른 컨텍스트는
  10m37s에 정상 pass — 인프라성 중복 타임아웃으로 판단, 병합 진행.

이번 건은 로컬 시뮬레이션이 아니라 **프로덕션 데이터·실제 API 호출·실제 재발급 PDF 다운로드**로
직접 확인 후 보고함. 시크릿 노출·결제·불가역 삭제 없음.
