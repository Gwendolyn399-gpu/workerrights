$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logFolder = Join-Path $projectRoot '.logs'
New-Item -ItemType Directory -Path $logFolder -Force | Out-Null

if (-not (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath (Join-Path $projectRoot '.venv\Scripts\python.exe') -ArgumentList @('-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logFolder 'backend.stdout.log') -RedirectStandardError (Join-Path $logFolder 'backend.stderr.log')
}
if (-not (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)) {
    $nodePath = (Get-Command node.exe).Source
    Start-Process -FilePath $nodePath -ArgumentList @('node_modules\next\dist\bin\next', 'dev', '-p', '3000') -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logFolder 'frontend.stdout.log') -RedirectStandardError (Join-Path $logFolder 'frontend.stderr.log')
}
Write-Output 'Local services started or already running. Logs: .logs'
