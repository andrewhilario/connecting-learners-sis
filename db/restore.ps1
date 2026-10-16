# Restores a .dump file (made by backup.ps1) into a NEW database and verifies row counts.
# Usage:
#   powershell -File db/restore.ps1 -DumpFile db/backups/sis_YYYYMMDD_HHMMSS.dump `
#       -AdminUrl "postgresql://postgres@localhost:5432/postgres" -NewDb sis_restore_test
# The target server must already have the roles sis_admin, sis_registrar, sis_student
# (they exist after running 06_roles.sql on the same server).
param(
    [Parameter(Mandatory = $true)][string]$DumpFile,
    [Parameter(Mandatory = $true)][string]$AdminUrl,   # connection to an existing maintenance DB (e.g. postgres)
    [string]$NewDb = "sis_restore_test"
)
$ErrorActionPreference = "Stop"
$env:PGOPTIONS = "-c client_min_messages=warning"
if ($NewDb -notmatch '^[a-z0-9_]+$') { throw "NewDb may only contain a-z, 0-9 and underscore." }
if (-not (Test-Path $DumpFile)) { throw "Dump file not found: $DumpFile" }

Write-Host "Creating database $NewDb ..."
psql --dbname="$AdminUrl" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $NewDb" -c "CREATE DATABASE $NewDb"
if ($LASTEXITCODE -ne 0) { throw "Could not create database." }

$base = $AdminUrl -replace '/[^/]*$', ''
$target = "$base/$NewDb"

Write-Host "Restoring $DumpFile into $NewDb ..."
pg_restore --dbname="$target" --no-owner --exit-on-error "$DumpFile"
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed." }

Write-Host "Verifying row counts:"
psql --dbname="$target" -c "SELECT 'users' AS tbl, COUNT(*) FROM users UNION ALL SELECT 'students', COUNT(*) FROM students UNION ALL SELECT 'subjects', COUNT(*) FROM subjects UNION ALL SELECT 'sections', COUNT(*) FROM sections UNION ALL SELECT 'enrollments', COUNT(*) FROM enrollments UNION ALL SELECT 'grades', COUNT(*) FROM grades UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log ORDER BY 1"
Write-Host "Restore complete."
