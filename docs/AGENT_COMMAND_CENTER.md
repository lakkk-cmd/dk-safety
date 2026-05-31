# AI 경영진 사령부 — 설정·운영 가이드

## 아키텍처

```
대장 (사령부 피드백) → boss_feedback (pending)
        ↓
매주 일요일 08:00 KST Cron → 3주제 × (6인 1·2라운드 병렬 토론 + 총괄 종합)
        ↓
agent_reports 저장 + agent_memory(structured_v1) 갱신 + 이메일
        ↓
피드백 applied → 다음 회의에 누적 기억 주입
```

## 대장이 해야 할 일 (최초 1회)

### 1. Supabase 마이그레이션

```powershell
Set-Location "c:\Users\user\Desktop\dk-safety"
# .env.local 에 DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정 후
npm run db:apply
```

`023_agent_command_center.sql` 이 적용되면 `agent_memory`, `agent_reports`, `boss_feedback` 테이블이 생성됩니다.

### 2. Anthropic API 키

1. https://console.anthropic.com/ 에서 API 키 발급
2. Vercel 프로젝트 → Settings → Environment Variables:
   - `ANTHROPIC_API_KEY`
   - (선택) `ANTHROPIC_MODEL` — 예: `claude-sonnet-4-6`

### 3. 이메일 (Resend)

1. https://resend.com 가입
2. 도메인 `dkansim.com` DNS 인증
3. 발신 주소 `report@dkansim.com` 사용 가능하도록 설정
4. Vercel 환경 변수:
   - `RESEND_API_KEY`
   - `REPORT_EMAIL` — 보고서 수신 주소

### 4. Cron 보안

```powershell
# 64바이트 hex 예시 생성 (PowerShell)
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

Vercel에 `CRON_SECRET` 등록. Vercel Cron은 자동으로 `Authorization: Bearer` 헤더를 붙입니다.

### 5. Vercel 환경 변수 체크리스트

| 변수 | 필수 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| `ANTHROPIC_API_KEY` | ✅ |
| `CRON_SECRET` | ✅ |
| `REPORT_EMAIL` | ✅ |
| `RESEND_API_KEY` | ✅ |
| `ANTHROPIC_MODEL` | 선택 |

`DK_SAFETY_USE_SUPABASE_DB`와 무관하게 에이전트는 URL+서비스 롤만 있으면 동작합니다.

### 6. 배포 후 검증

```powershell
npm run cron:test
```

성공 시 `{ "success": true, ... }` JSON. 실패 시 HTTP 상태·메시지 확인.

## 일상 운영 (대장)

1. https://dkansim.com/admin/command-center 접속 (관리자 로그인)
2. **대장 피드백** 입력 → 다음 일요일 08:00 회의에 반영
3. 일요일 아침 **이메일 보고서** 확인
4. 사령부에서 **조직 기억**·**보고서 이력** 확인

## API 비용 참고

주 1회 Cron 기준 대략:

- 3주제 × (6×2 라운드 + 1 총괄) = 39회 + 주간 통합 1회 ≈ **40회 Claude 호출/주**

Vercel Pro `maxDuration=300` 초 내 완료를 목표로 설계되었습니다.

## 문제 해결

| 증상 | 확인 |
|------|------|
| 401 Unauthorized (cron:test) | `CRON_SECRET` 일치, 프로덕션 URL 사용 |
| Supabase 미설정 | URL·서비스 롤 키, `db:apply` |
| 테이블 없음 | 023 마이그레이션 미적용 |
| 이메일 안 옴 | Resend 도메인·`REPORT_EMAIL` |
| 타임아웃 | Vercel Hobby는 10초 제한 → Pro 필요 |
