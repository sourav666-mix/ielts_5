# ==============================================================
# ATLAS IELTS Academy — one-command backend start (Windows)
# Run from anywhere:  .\start-backend.ps1
# (Activates the venv for you, so "uvicorn not recognized" can't
#  happen — uvicorn lives inside backend\.venv.)
# ==============================================================

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $here ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "No venv found — creating one and installing requirements..." -ForegroundColor Yellow
    python -m venv (Join-Path $here ".venv")
    & $python -m pip install -r (Join-Path $here "requirements.txt")
}

Write-Host "Starting ATLAS IELTS Academy backend on http://localhost:8000" -ForegroundColor Green
Write-Host "  API docs : http://localhost:8000/api/docs" -ForegroundColor Green
Write-Host "  Health   : http://localhost:8000/health"   -ForegroundColor Green
Set-Location $here
& $python -m uvicorn app.main:app --reload --port 8000
