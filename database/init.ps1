#!/usr/bin/env powershell

# SmartTT Database Setup Script for Windows PowerShell

Write-Host "=== SmartTT Database Setup ===" -ForegroundColor Green
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
Write-Host "Creating database '$DB_NAME'..."

# Create database (suppress error if it already exists)
& psql -h $PGHOST -U $PGUSER -c "CREATE DATABASE $DB_NAME;" 2>&1 | Out-Null

Write-Host "SUCCESS: Database ready" -ForegroundColor Green
Write-Host ""
Write-Host "Running schema.sql..."

# Run schema
& psql -h $PGHOST -U $PGUSER -d $DB_NAME -f schema.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: Schema loaded successfully" -ForegroundColor Green
} else {
    Write-Host "ERROR: Failed to load schema" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host "Database: $DB_NAME"
Write-Host "Host: $PGHOST"
Write-Host "Port: $PGPORT"
Write-Host "User: $PGUSER"

# Clear password from environment
$env:PGPASSWORD = ""
