#!/usr/bin/env powershell

# SmartTT Database Clear/Reset Script for Windows PowerShell

Write-Host "=== SmartTT Database Reset ===" -ForegroundColor Yellow
Write-Host ""

# PostgreSQL connection details
$PGHOST = "localhost"
$PGPORT = "5432"
$PGUSER = "postgres"
$PGPASSWORD = "soham2255"
$DB_NAME = "SMARTTT"

Write-Host "Checking PostgreSQL connection..."
$env:PGPASSWORD = $PGPASSWORD

# Test connection
try {
    & psql -h $PGHOST -U $PGUSER -c "SELECT 1" 2>&1 | Out-Null
    Write-Host "SUCCESS: PostgreSQL connection successful" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to connect to PostgreSQL" -ForegroundColor Red
    Write-Host "Make sure PostgreSQL is running on $PGHOST`:$PGPORT"
    exit 1
}

Write-Host ""
Write-Host "WARNING: This will DROP all tables in database '$DB_NAME'" -ForegroundColor Red
Write-Host "All data will be lost permanently!" -ForegroundColor Red
Write-Host ""

$confirmation = Read-Host "Type 'YES' to confirm database reset"

if ($confirmation -ne "YES") {
    Write-Host "Operation cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Dropping all tables from database '$DB_NAME'..."

# Drop all tables
$dropSQL = @"
DROP TABLE IF EXISTS student_feedback CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS timetable CASCADE;
DROP TABLE IF EXISTS professors_subjects CASCADE;
DROP TABLE IF EXISTS subjects_branches CASCADE;
DROP TABLE IF EXISTS batches CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS professors CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS time_slots CASCADE;
"@

$dropSQL | & psql -h $PGHOST -U $PGUSER -d $DB_NAME

if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: All tables dropped" -ForegroundColor Green
} else {
    Write-Host "ERROR: Failed to drop tables" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Database Reset Complete ===" -ForegroundColor Green
Write-Host "Database '$DB_NAME' is now empty and ready for new schema" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Run './init.ps1' to restore the schema"
Write-Host "2. Or wait for further instructions on database changes"
