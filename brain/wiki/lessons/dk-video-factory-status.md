---
name: dk-video-factory-status
description: "비용 0원 영상 파이프라인 스펙 7단계 전부 완료 (2026-07-07) — 채팅에서 에이전트가 영상 제작을 스스로 걸 수 있음"
metadata: 
  node_type: memory
  type: project
  originSessionId: ada164ad-3b49-4289-884e-37e8bdfdb2a9
---

dk-video-factory (비용 0원 영상 제작 파이프라인) — 2026-07-07 스펙 7단계 전부 구현+e2e 검증 완료.

- 구조: video_jobs 테이블(063) → 로컬 워커(`npm run worker`, worker/index.mjs) 폴링 → Claude 대본(worker/video-orchestrator-system-prompt.md 수정으로 스타일 변경 가능) → msedge-tts(v2, Python edge-tts 대체 — v1.3은 접속 거부됨) → Remotion 렌더(remotion/, Master+HookTitle/Checklist/Diagram/CTA) → videos 버킷 → **pending_review 승인 게이트** → hq.dkansim.com/videos에서 승인/반려 → 워커가 approved만 원자 선점해 유튜브 비공개 업로드(published).
- 검토 알림: 워커가 프로덕션 `/api/video-jobs/notify-review`(AGENT_WRITE_SECRET) 호출 → 카카오 나에게 보내기. 로컬엔 카카오/Solapi 키 없음 — 프로덕션 API가 대행하는 패턴.
- 승인 게이트 검증됨: 조건부 UPDATE(pending_review→approved/rejected, approved→uploading)라 우회 경로 없음. 첫 실업로드: youtu.be/47PGImGjhJw (대장이 실제로 대시보드에서 승인한 잡).
- Storage 업로드 시 `apikey` 헤더 필수 (sb_secret 키는 JWT가 아니라 Authorization만으론 403 Invalid Compact JWS).
- 7단계: 풀에이전트 도구 create_video_job/get_video_job — 채팅에서 실증(오케스트레이터가 실제 잡 등록→렌더→알림). 업로드는 비공개 컨벤션(공개 전환은 유튜브 스튜디오).
- 중요 발견: 풀에이전트 Gemini 검토가 도구 실행 내역을 몰라 수행 보고를 차단하던 버그 — 실행된 toolCalls를 검토 context로 전달해 해결(chat route). 같은 클래스 문제가 다른 수행형 도구에서 재발하면 이 패턴 참조.
- 워커 상시 가동 설정 완료(2026-07-07): pm2 7.0.3 + ecosystem.config.js(video-worker, 자동재시작) + pm2 save + pm2-windows-startup(로그인 시 자동 부활, HKCU Run 레지스트리). 로그: worker/logs/, 확인: pm2 status / pm2 logs video-worker.

관련: [[deploy-workflow]], [[missing-agent-write-secret-gh]]
