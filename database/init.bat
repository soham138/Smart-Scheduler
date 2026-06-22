@echo off
REM Database initialization script for SMARTTT (Windows)

echo === SmartTT Database Setup ===
echo.

REM PostgreSQL connection details
set PGHOST=localhost
set PGPORT=5432
set PGUSER=postgres
set PGPASSWORD=soham2255
set DB_NAME=smarttt

echo Checking PostgreSQL connection...
psql -h %PGHOST% -U %PGUSER% -c "SELECT 1" >nul 2>&1

if errorlevel 1 (
    echo ERROR: Failed to connect to PostgreSQL
    echo Make sure PostgreSQL is running on %PGHOST%:%PGPORT%
    exit /b 1
)

echo SUCCESS: PostgreSQL connection successful
echo.

echo Creating database '%DB_NAME%'...

REM Try to create database - if it already exists, the error will be ignored
psql -h %PGHOST% -U %PGUSER% -c "CREATE DATABASE %DB_NAME%;" 2>nul

echo SUCCESS: Database ready
echo.

echo Running schema.sql...
psql -h %PGHOST% -U %PGUSER% -d %DB_NAME% -f schema.sql

if errorlevel 1 (
    echo ERROR: Failed to load schema
    exit /b 1
)

echo SUCCESS: Schema loaded successfully
echo.

echo === Setup Complete ===
echo Database: %DB_NAME%
echo Host: %PGHOST%
echo Port: %PGPORT%
echo User: %PGUSER%
pause
