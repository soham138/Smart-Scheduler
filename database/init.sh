#!/bin/bash
# Database initialization script for SMARTTT

echo "=== SmartTT Database Setup ==="
echo ""

# PostgreSQL connection details
PGHOST="localhost"
PGPORT="5432"
PGUSER="postgres"
PGPASSWORD="soham2255"
DB_NAME="SMARTTT"

# Check if PostgreSQL is running
echo "Checking PostgreSQL connection..."
export PGPASSWORD=$PGPASSWORD
psql -h $PGHOST -U $PGUSER -c "SELECT 1" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Failed to connect to PostgreSQL"
    echo "Make sure PostgreSQL is running on $PGHOST:$PGPORT"
    exit 1
fi

echo "✓ PostgreSQL connection successful"
echo ""

# Create database
echo "Creating database '$DB_NAME'..."
psql -h $PGHOST -U $PGUSER -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || psql -h $PGHOST -U $PGUSER -c "CREATE DATABASE $DB_NAME"

if [ $? -eq 0 ]; then
    echo "✓ Database created or already exists"
else
    echo "❌ Failed to create database"
    exit 1
fi

echo ""
echo "Running schema.sql..."

# Run schema
psql -h $PGHOST -U $PGUSER -d $DB_NAME -f schema.sql

if [ $? -eq 0 ]; then
    echo "✓ Schema loaded successfully"
else
    echo "❌ Failed to load schema"
    exit 1
fi

echo ""
echo "=== Setup Complete ==="
echo "Database: $DB_NAME"
echo "Host: $PGHOST"
echo "Port: $PGPORT"
echo "User: $PGUSER"
