@echo off
REM dk-safety 새 PC 원클릭 부트스트랩
REM 이 파일을 더블클릭하면 Git/Node/GitHub CLI/Claude Code 설치부터
REM 저장소 clone, 로그인, MCP/플러그인 설정, Claude Code 실행까지 전부 자동으로 됩니다.
REM 파일탐색기 더블클릭은 cmd.exe의 cwd 자동탐색 보안정책과 무관하게 항상 동작합니다.

powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/lakkk-cmd/dk-safety/main/scripts/setup-new-pc.ps1 | iex"

pause
