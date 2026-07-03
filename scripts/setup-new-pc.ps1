# dk-safety 새 PC 자동 셋업 스크립트
#
# 사용법 A) 완전히 새 PC (Git/Node조차 없음):
#   이 파일 하나만 새 PC의 아무 빈 폴더로 옮긴 뒤, 그 폴더에서 PowerShell을 열고:
#     powershell -ExecutionPolicy Bypass -File setup-new-pc.ps1
#   -> Git/Node.js/GitHub CLI/Claude Code CLI 설치, 저장소 clone, npm install,
#      로그인, MCP/플러그인 등록까지 전부 자동으로 처리합니다.
#
# 사용법 B) 이미 git clone된 dk-safety 폴더 안에서 실행:
#     npm run setup:new-pc
#   (또는 그 폴더 안에서 위와 동일하게 직접 실행해도 됩니다)
#
# 이 스크립트가 대신 할 수 없는 것:
#   - .env.local / .env.production 파일 자체 (git에 없는 비밀키 파일이라 외장하드 등으로
#     직접 옮겨서 프로젝트 루트에 넣어줘야 합니다. 없으면 경고만 띄우고 넘어갑니다)
#   - gh / claude 로그인의 실제 인증 절차 (브라우저 창이 뜨면 직접 로그인해야 합니다)
#
# 참고: native exe 호출 시 스트림을 리다이렉트하지 않습니다.
#   Windows PowerShell 5.1에서 native 명령 stderr를 리다이렉트하면(*>$null, 2>&1 등)
#   정상적인 비정상-종료(예: "이미 존재함")조차 NativeCommandError로 바뀌어 스크립트가
#   중단되는 문제가 있어, 대신 매번 출력은 그대로 보여주고 $LASTEXITCODE로만 판단합니다.

$ErrorActionPreference = "Continue"
$RepoUrl = "https://github.com/lakkk-cmd/dk-safety.git"
$MinNodeMajor = 20

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
    exit 1
}

# --- 2. Git ---
Write-Step "Git 확인/설치"
if (-not (Test-Cmd "git")) {
    winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
} else {
    Write-Host "Git 이미 설치됨: $(git --version)"
}

# --- 3. Node.js ---
Write-Step "Node.js 확인/설치 (>= v$MinNodeMajor)"
$needNode = $true
if (Test-Cmd "node") {
    $verStr = (node -v) -replace '^v', ''
    $major = [int]($verStr.Split('.')[0])
    if ($major -ge $MinNodeMajor) {
        $needNode = $false
        Write-Host "Node.js 이미 설치됨: v$verStr"
    }
}
if ($needNode) {
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
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

# --- 7. npm install ---
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

# --- 11. MCP 서버 등록 ---
Write-Step "playwright MCP 등록 (이 프로젝트 전용)"
Add-McpJson "playwright" '{\"type\":\"stdio\",\"command\":\"npx\",\"args\":[\"-y\",\"@playwright/mcp@latest\"]}' $null

Write-Step "claude-design MCP 등록 (전역)"
Add-McpJson "claude-design" '{\"type\":\"http\",\"url\":\"https://api.anthropic.com/v1/design/mcp\"}' "user"

# --- 12. OMC 플러그인 ---
Write-Step "oh-my-claudecode 플러그인 설치"
claude plugin marketplace add "https://github.com/Yeachan-Heo/oh-my-claudecode.git"
claude plugin install oh-my-claudecode
Write-Host "완료 (이미 설치돼 있으면 위에 안내 메시지가 표시됩니다)"

# --- 완료 ---
Write-Step "셋업 완료"
Write-Host "다음을 확인하세요:" -ForegroundColor Green
Write-Host "  1) .env.local이 실제로 채워져 있는지"
Write-Host "  2) npm run dev 로 로컬 서버가 뜨는지"
Write-Host "  3) claude 실행 후 세션이 정상 시작되는지"
