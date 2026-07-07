// pm2 설정 — dk-video-factory 로컬 워커 상시 가동
// 시작: pm2 start ecosystem.config.js / 로그: pm2 logs video-worker
module.exports = {
  apps: [
    {
      name: "video-worker",
      script: "worker/index.mjs",
      node_args: "--env-file=.env.local",
      cwd: __dirname,
      autorestart: true,       // 에러로 죽으면 자동 재시작
      restart_delay: 5000,     // 재시작 전 5초 대기
      max_restarts: 20,        // 연속 크래시 시 무한루프 방지
      out_file: "worker/logs/out.log",
      error_file: "worker/logs/error.log",
      time: true,              // 로그에 타임스탬프
    },
  ],
};
