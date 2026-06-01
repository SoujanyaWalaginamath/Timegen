# setup_env.ps1
# Run in PowerShell from project root to create .env from .env.example and open in Notepad

$src = Join-Path -Path $PSScriptRoot -ChildPath "..\.env.example"
$dst = Join-Path -Path $PSScriptRoot -ChildPath "..\.env"

if (Test-Path $dst) {
  Write-Host ".env already exists at $dst"
  exit 0
}

Copy-Item -Path $src -Destination $dst -ErrorAction Stop
Write-Host "Created .env from .env.example at $dst"

# Open with default editor (Notepad)
Start-Process notepad.exe $dst
