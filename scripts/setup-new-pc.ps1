# dk-safety 새 PC 완전 자동 셋업 스크립트
#
# 완전히 빈 새 PC에서, 아무것도 설치되어 있지 않은 상태에서 실행할 단 한 줄:
#
#   irm https://raw.githubusercontent.com/lakkk-cmd/dk-safety/main/scripts/setup-new-pc.ps1 | iex
#
# 이 한 줄이 하는 일: Git/Node.js/GitHub CLI/Claude Code CLI 설치 -> 저장소 clone
# -> npm install -> GitHub/Claude 로그인 -> claude-design MCP 등록 ->
# oh-my-claudecode 플러그인 설치 -> 마지막으로 dk-safety 폴더 안에서 Claude Code를
# 직접 실행(claude)까지 자동으로 이어집니다.
#
# 이미 clone된 폴더 안에서는 다음으로도 실행 가능:
#   npm run setup:new-pc
#
# ------------------------------------------------------------------------------
# "항상 최신 상태" 설계 원칙 (수동 유지보수를 최소화하기 위한 구조):
#   - Node.js 최소 버전은 이 스크립트에 하드코딩하지 않는다. Node가 아예 없으면
#     최신 LTS를 설치하고, 정확한 버전 요구사항(>=20.9.0 등)은 package.json의
#     "engines" 필드를 npm install이 자동으로 검사/경고하므로 이 스크립트가
#     따로 흉내내지 않는다 (package.json이 바뀌면 자동으로 최신 기준이 적용됨).
#   - playwright MCP는 이 스크립트가 하드코딩하지 않는다. 저장소 루트의 .mcp.json
#     (git 커밋됨, project scope)에 선언되어 있어서, git clone/pull만 하면 자동으로
#     최신 목록이 따라온다. 새 MCP 서버가 필요해지면 `claude mcp add -s project ...`
#     로 추가해 .mcp.json에 커밋하면 이 스크립트를 고칠 필요 없이 모두에게 전파된다.
#     (최초 1회 `claude` 실행 시 "Pending approval" 승인만 눌러주면 됨 - 보안상
#     자동 승인은 하지 않음)
#   - claude-design MCP와 oh-my-claudecode 플러그인은 프로젝트가 아닌 "이 Claude
#     계정/환경" 단위 설정이라 .mcp.json에 넣을 수 없어 이 스크립트에 남겨둔다.
#
# 이 스크립트가 대신 할 수 없는 것 (보안상 의도적으로 자동화하지 않음):
#   - .env.local / .env.production 파일 자체 (git에 없는 비밀키라 외장하드 등으로
#     직접 옮겨야 함. 없으면 경고만 띄우고 넘어감)
#   - gh / claude 로그인의 실제 인증 절차 (브라우저 창에서 직접 로그인)
#   - .mcp.json의 "Pending approval" 최초 1회 승인 (낯선 MCP 서버 자동실행 방지)

function Start-DkSafetySetup {
    $ErrorActionPreference = "Continue"
    $RepoUrl = "https://github.com/lakkk-cmd/dk-safety.git"

    function Write-Step($msg) {
        Write-Host ""
        Write-Host "==> $msg" -ForegroundColor Cyan
    }

    function Test-Cmd($name) {
        return [bool](Get-Command $name -ErrorAction SilentlyContinue)
    }

    function Refresh-Path {
        $machine = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
        $user = [System.Environment]::GetEnvironmentVariable("PATH", "User")
        $env:PATH = "$machine;$user"
    }

    # claude mcp add-json은 PowerShell 5.1의 native-exe 인용부호 처리 버그 때문에
    # 직접 호출하면 JSON이 깨진다. cmd /c를 한 겹 씌우면 정상 동작한다 (실측 확인됨).
    function Add-McpJson($name, $jsonEscaped, $scope) {
        if ($scope) {
            cmd /c "claude mcp add-json -s $scope $name `"$jsonEscaped`""
        } else {
            cmd /c "claude mcp add-json $name `"$jsonEscaped`""
        }
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  -> 등록됨"
        } else {
            Write-Host "  -> 스킵 (이미 등록돼 있거나 등록 실패, 위 메시지 참고)"
        }
    }

    # --- 1. winget 확인 ---
    Write-Step "winget 확인"
    if (-not (Test-Cmd "winget")) {
        Write-Host "winget이 없습니다. Microsoft Store에서 'App Installer'를 먼저 설치한 뒤 다시 실행해주세요." -ForegroundColor Red
        return
    }

    # --- 2. Git ---
    Write-Step "Git 확인/설치"
    if (-not (Test-Cmd "git")) {
        winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
        Refresh-Path
    } else {
        Write-Host "Git 이미 설치됨: $(git --version)"
    }

    # --- 3. Node.js (없으면 최신 LTS 설치, 정확한 버전 기준은 npm install이 자동 검사) ---
    Write-Step "Node.js 확인/설치"
    if (-not (Test-Cmd "node")) {
        winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
        Refresh-Path
    } else {
        Write-Host "Node.js 이미 설치됨: $(node -v)"
    }

    # --- 4. GitHub CLI ---
    Write-Step "GitHub CLI 확인/설치"
    if (-not (Test-Cmd "gh")) {
        winget install --id GitHub.cli -e --silent --accept-package-agreements --accept-source-agreements
        Refresh-Path
    } else {
        Write-Host "GitHub CLI 이미 설치됨"
    }

    # --- 5. Claude Code CLI ---
    Write-Step "Claude Code CLI 확인/설치"
    if (-not (Test-Cmd "claude")) {
        npm install -g @anthropic-ai/claude-code
        Refresh-Path
    } else {
        Write-Host "Claude Code 이미 설치됨: $(claude --version)"
    }

    # --- 6. 저장소 확인/clone ---
    Write-Step "프로젝트 폴더 확인"
    $inRepo = $false
    if (Test-Path ".\package.json") {
        $pkgName = (Select-String -Path ".\package.json" -Pattern '"name":\s*"dk-safety"' -Quiet -ErrorAction SilentlyContinue)
        if ($pkgName) { $inRepo = $true }
    }
    if (-not $inRepo) {
        if (-not (Test-Path ".\dk-safety")) {
            Write-Step "dk-safety 저장소 clone"
            git clone $RepoUrl
        }
        Set-Location ".\dk-safety"
        Write-Host "작업 폴더: $(Get-Location)"
    }

    # --- 7. npm install (package.json의 engines 기준을 npm이 알아서 검사/경고함) ---
    Write-Step "npm install"
    npm install

    # --- 8. .env 파일 확인 ---
    Write-Step ".env.local / .env.production 확인"
    if (-not (Test-Path ".\.env.local")) {
        Write-Host "[경고] .env.local이 없습니다. 외장하드/백업에서 복사해 프로젝트 루트에 넣어주세요." -ForegroundColor Yellow
        Write-Host "       필요한 키 목록은 .env.example 참고" -ForegroundColor Yellow
    } else {
        Write-Host ".env.local 확인됨"
    }
    if (-not (Test-Path ".\.env.production")) {
        Write-Host "[경고] .env.production이 없습니다 (배포용, 로컬 개발에는 필수 아님)." -ForegroundColor Yellow
    } else {
        Write-Host ".env.production 확인됨"
    }

    # --- 9. GitHub 로그인 ---
    Write-Step "GitHub 로그인 확인"
    gh auth status
    if ($LASTEXITCODE -ne 0) {
        Write-Host "GitHub 로그인이 필요합니다. 브라우저 창을 따라 로그인해주세요."
        gh auth login
    } else {
        Write-Host "GitHub 이미 로그인됨"
    }

    # --- 10. Claude Code 로그인 ---
    Write-Step "Claude Code 로그인 확인"
    claude auth status
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Claude Code 로그인이 필요합니다. 브라우저 창을 따라 로그인해주세요."
        claude auth login
    } else {
        Write-Host "Claude Code 이미 로그인됨"
    }

    # --- 11. claude-design MCP 등록 (전역, 계정 단위이므로 .mcp.json으로 못 옮김) ---
    # playwright MCP는 저장소에 커밋된 .mcp.json (project scope)에 이미 선언되어 있어
    # 여기서 따로 등록하지 않는다 - git clone만으로 자동 전파됨.
    Write-Step "claude-design MCP 등록 (전역)"
    Add-McpJson "claude-design" '{\"type\":\"http\",\"url\":\"https://api.anthropic.com/v1/design/mcp\"}' "user"

    # --- 12. OMC 플러그인 ---
    Write-Step "oh-my-claudecode 플러그인 설치"
    claude plugin marketplace add "https://github.com/Yeachan-Heo/oh-my-claudecode.git"
    claude plugin install oh-my-claudecode
    Write-Host "완료 (이미 설치돼 있으면 위에 안내 메시지가 표시됩니다)"

    # --- 완료 ---
    Write-Step "셋업 완료 - Claude Code를 시작합니다"
    Write-Host "아래 사항은 직접 확인/조치가 필요합니다:" -ForegroundColor Green
    Write-Host "  1) .env.local이 실제로 채워져 있는지 (외장하드에서 복사했는지)"
    Write-Host "  2) 처음 뜨는 화면에서 .mcp.json의 playwright 서버 'Pending approval' 승인"
    Write-Host ""

    claude
}

Start-DkSafetySetup
