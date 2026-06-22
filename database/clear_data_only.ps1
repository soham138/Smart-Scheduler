#!/usr/bin/env powershell

# SmartTT Database Clear Data Script (keeps schema intact)

Write-Host "=== SmartTT Database Clear Data ===" -ForegroundColor Yellow
Write-Host ""

# PostgreSQL connection details
$PGHOST = "localhost"
$PGPORT = "5432"
$PGUSER = "postgres"
$PGPASSWORD = "soham2255"
$DB_NAME = "smarttt"

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
Write-Host "Creating database if not exists..."

# Create database if it doesn't exist
& psql -h $PGHOST -U $PGUSER -c "CREATE DATABASE $DB_NAME;" 2>&1 | Out-Null

Write-Host ""
Write-Host "Loading schema..."

# Load schema
& psql -h $PGHOST -U $PGUSER -d $DB_NAME -f schema.sql

Write-Host ""
Write-Host "Clearing data from all tables (keeping schema intact)..."

# Clear data from all tables (preserving foreign key constraints)
$clearSQL = @"
TRUNCATE TABLE student_feedback CASCADE;
TRUNCATE TABLE assignments CASCADE;
TRUNCATE TABLE timetable CASCADE;
TRUNCATE TABLE professors_subjects CASCADE;
TRUNCATE TABLE subjects_branches CASCADE;
TRUNCATE TABLE batches CASCADE;
TRUNCATE TABLE subjects CASCADE;
TRUNCATE TABLE professors CASCADE;
TRUNCATE TABLE branches CASCADE;
TRUNCATE TABLE time_slots CASCADE;
"@

$clearSQL | & psql -h $PGHOST -U $PGUSER -d $DB_NAME

if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: All table data cleared" -ForegroundColor Green
} else {
    Write-Host "WARNING: Some tables may not exist yet, but schema is ready" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Database Ready ===" -ForegroundColor Green
Write-Host "Tables are empty and ready for new data" -ForegroundColor Green
