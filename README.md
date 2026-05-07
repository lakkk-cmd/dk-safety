# 대경안심전기 (우리 집 전기 주치의)

Next.js 기반 전기 점검/수리 예약 홈페이지입니다.

## 주요 기능

- 메인 랜딩 페이지 (`/`)
- 예약 접수 페이지 (`/reservation`)
- 예약 저장/조회 API (`/api/reservations`)
- 관리자 예약 목록 (`/admin`)
- 관리자 로그인 (`/admin/login`, 쿠키 기반 보호)
- 예약 상태관리 (접수/진행중/완료)
- 관리자 검색/상태 필터 + CSV 다운로드
- 관리자 페이지네이션 + 상태 변경 토스트 + 예약별 관리 메모
- 상태 통계 카드 + 정렬 옵션 + 메모 수정시각 기록
- 관리자 활동 로그 패널 + 예약 저장 시 자동 백업 스냅샷
- 백업 자동 정리(최근 30개 유지) + 활동 로그 검색/필터 + 로그 CSV 다운로드
- 예약 추가 시 스냅샷 누적 보관 + `reservations-latest.json` 최신 백업 지속 갱신
- 관리자에서 수동 백업 생성 + 백업 목록 확인 + 특정 스냅샷 복원
- 복원 전 미리보기(건수/접수기간) + 복원 직전 체크포인트 자동 생성
- 체크포인트 필터 + 긴급 롤백 버튼 + 백업 JSON 파일 다운로드
- 복원 결과 diff 요약(추가/삭제/변경/동일) + 체크포인트 라벨(복원 사유) 기록
- 입주민 전용 로그인/아파트 선택 + 15문항 전기 안전 자가진단 페이지
- 광주 8년+ 아파트 10개 자동등록(유니버시아드힐스테이트3단지 포함) + 수동 추가
- 입주민 로그인/자가진단/아파트 추가 활동 및 데이터 자동 저장(`data/resident-db.json`)
- 입주민 자가진단 결과 히스토리 페이지(최근 점수/평균/진단 횟수/시간순 이력)
- 관리자 입주민 통합현황 페이지(`/admin/resident-safety`) + 단지별 위험도/고위험 목록/CSV

## 환경변수

`.env.example`을 참고해 `.env.local`을 생성하세요.

- `NEXT_PUBLIC_BUSINESS_PHONE`: 메인 전화 문의 번호
- `NEXT_PUBLIC_KAKAO_OPENCHAT_URL`: 카카오 오픈채팅 링크
- `ADMIN_PASSWORD`: 관리자 로그인 비밀번호
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 URL
- `SUPABASE_SERVICE_ROLE_KEY`: 서버 전용 서비스 키(절대 클라이언트 노출 금지)
- `SUPABASE_DATA_BUCKET`: 예약/입주민 JSON 데이터 저장 버킷명
- `SUPABASE_UPLOAD_BUCKET`: 현장사진 업로드 버킷명(공개 버킷 권장)
- `SUPABASE_UPLOAD_PUBLIC_BASE_URL`: 업로드 파일 공개 URL 베이스(미설정 시 Supabase 기본 공개 경로 사용)
- `KAKAO_ALIMTALK_WEBHOOK_URL`: (선택) 작업 완료 시 고객 알림톡 발송용 웹훅 URL
- `SMS_WEBHOOK_URL`: (선택) 작업 완료 시 고객 문자 발송용 웹훅 URL

## 실행

```bash
npm install
npm run dev
```

## GitHub + Vercel + dkansim.com (원클릭)

1. `gh auth login` 과 `npx vercel login` 을 한 번 실행합니다. (또는 `GITHUB_TOKEN`, `VERCEL_TOKEN` 환경 변수)
2. 프로젝트 루트에서 `npm run setup:deploy` 를 실행합니다.  
   GitHub에 비공개 저장소 `dk-safety`가 만들어지고 푸시되며, Vercel 프로젝트 연결·`.env.local`의 **비어 있지 않은** 변수를 Production/Preview에 등록·`dkansim.com` / `www.dkansim.com` 도메인 연결·Git 연동까지 진행합니다.
3. 스크립트가 출력하는 DNS 안내에 따라 도메인 등록업체에서 레코드를 맞춘 뒤, Vercel에서 인증이 끝나면 `npx vercel --prod` 또는 이후 `git push`로 배포합니다.

저장소 이름·도메인·Vercel 프로젝트명은 `GITHUB_REPO_NAME`, `DOMAIN`, `VERCEL_PROJECT` 환경 변수로 바꿀 수 있습니다.

## 배포 모드(운영 권장)

프로덕션에서는 로컬 파일 대신 Supabase Storage를 사용하도록 자동 전환됩니다.

1. Supabase Storage 버킷 생성
   - `dk-safety-data` (비공개 권장)
   - `dk-safety-uploads` (공개 권장)
2. 배포 환경변수 설정
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_DATA_BUCKET`
   - `SUPABASE_UPLOAD_BUCKET`
   - (선택) `SUPABASE_UPLOAD_PUBLIC_BASE_URL`
3. [Vercel](https://vercel.com) 등에 Git 저장소를 연결한 뒤, Project → Settings → Environment Variables에 이 문서 상단「환경변수」에 적힌 값을 모두 등록합니다(서비스 롤 키는 Production에만 두는 것을 권장합니다).
4. 배포 후 동작
   - 예약/입주민 데이터: Supabase `dk-safety-data` 버킷의 JSON 객체로 저장
   - 현장사진: Supabase `dk-safety-uploads` 버킷으로 업로드

환경변수가 없으면 기존 로컬 파일 저장(`data/*.json`, `public/uploads`) 방식으로 동작합니다.

### Docker

프로덕션용 이미지는 멀티스테이지 `Dockerfile`과 Next `standalone` 출력을 사용합니다.

```bash
# 배포용 .env.production이 없으면: npm run env:production (.env.example 복사)
docker compose up --build
# 또는
docker build -t dk-safety .
docker run -p 3000:3000 --env-file .env.production dk-safety
```

컨테이너 파일시스템은 휘발성이므로 운영 데이터는 Supabase Storage 연동을 권장합니다. `.env.production`은 저장소에 커밋하지 마세요.

## 기존 로컬 데이터 이관

이미 운영 중인 로컬 데이터가 있다면 아래 명령으로 Supabase로 한 번에 이관할 수 있습니다.

```bash
npm run sync:supabase
```

동기화 대상:
- `data/reservations.json`
- `data/resident-db.json`
- `public/uploads/**`
