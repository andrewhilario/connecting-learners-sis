# Full backup of the SIS database (schema + data + privileges + RLS policies) using pg_dump.
# Usage:
#   powershell -File db/backup.ps1 -Url "postgresql://postgres@localhost:5432/sis_dev"
#   (or set $env:DATABASE_URL first)
# Output: db/backups/sis_<timestamp>.dump (custom format, restorable with pg_restore)
#         db/backups/sis_<timestamp>.sql  (plain SQL copy, human-readable)
param(
    [string]$Url = $env:DATABASE_URL,
    [string]$OutDir = (Join-Path $PSScriptRoot "backups")
)
$ErrorActionPreference = "Stop"
if (-not $Url) { throw "Provide -Url or set DATABASE_URL." }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dump  = Join-Path $OutDir "sis_$stamp.dump"
$plain = Join-Path $OutDir "sis_$stamp.sql"

Write-Host "Backing up to $dump ..."
pg_dump --dbname="$Url" --format=custom --no-owner --file="$dump"
if ($LASTEXITCODE -ne 0) { throw "pg_dump (custom) failed." }
pg_dump --dbname="$Url" --format=plain --no-owner --file="$plain"
if ($LASTEXITCODE -ne 0) { throw "pg_dump (plain) failed." }

Get-Item $dump, $plain | Select-Object Name, @{n = "SizeKB"; e = { [math]::Round($_.Length / 1KB, 1) } } | Format-Table | Out-String | Write-Host
Write-Host "Backup complete."
