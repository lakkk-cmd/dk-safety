# 2026-09-23 PR #43 배포 기록 시각 정정

## 결정사항
- `HANDOFF_TO_GROK.md`의 PR #43 배포 완료 기록은 코드 주장(subset:false, U+2126, warnIfUnsupportedGlyphs, 4개 라우트 공유)과 PR 상태(MERGED, CI 통과, 머지 커밋 `fd513e6`)는 맞다.
- 배포 시각만 GitHub `mergedAt`(UTC)을 KST로 잘못 적었다. PR #41 머지는 11:14 KST, PR #43 머지는 12:42 KST, Vercel Ready는 각각 11:16·12:45 KST다. 손상 PDF를 찾을 창구도 그 구간으로 고친다.
- `https://dkansim.com/` 은 200이 아니라 307 → `/home`이다.

## 변경된 파일
- `docs/collab/apt-manager-inspection/HANDOFF_TO_GROK.md`
- `docs/collab/apt-manager-inspection/STATUS.md`

## 알게 된 것
- 같은 오표기를 고친 커밋 `0bd7a43`은 `origin/cursor/bc-caf4f2ff-d6f5-4e49-9c75-1f6b8bc5d569-ae41`에만 있고 main에는 없다.

## 미해결
- 시연전용아파트 111동 111호 정정본 재발급과, 11:14–12:45 KST 사이 실고객 발급건 확인은 관리자 화면에서 아직 필요하다.
