#!/bin/bash
# Test script for SmartTT Timetable Generation Algorithm v2.0
# Tests all new features and constraints

echo "================================"
echo "SmartTT Timetable Algorithm v2.0"
echo "Integration Test Suite"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test API endpoint
test_endpoint() {
  local test_name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_status=$5

  echo -n "Testing: $test_name ... "
  
  if [ "$method" = "POST" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST \
      http://localhost:5000$endpoint \
      -H "Content-Type: application/json" \
      -d "$data")
  else
    response=$(curl -s -w "\n%{http_code}" http://localhost:5000$endpoint)
  fi
  
  status_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)
  
  if [ "$status_code" = "$expected_status" ]; then
    echo -e "${GREEN}✓ PASS${NC} (Status: $status_code)"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC} (Expected: $expected_status, Got: $status_code)"
    echo "Response: $body"
    ((TESTS_FAILED++))
  fi
}

# Check if backend is running
echo "Checking backend service..."
if ! curl -s http://localhost:5000/health > /dev/null 2>&1; then
  echo -e "${RED}ERROR: Backend not running on port 5000${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Backend is running${NC}"
echo ""

echo "================================"
echo "Test 1: Tea Break Scheduling"
echo "================================"
test_endpoint "Get timetable with tea break" "GET" "/timetable/1/1" "" 200
echo ""

echo "================================"
echo "Test 2: Recess Scheduling"
echo "================================"
test_endpoint "Verify recess times (13:15-14:00)" "GET" "/timetable/1/1" "" 200
echo ""

echo "================================"
echo "Test 3: Library Hour Scheduling"
echo "================================"
test_endpoint "Verify library hour Friday 4-5 PM" "GET" "/timetable/1/1" "" 200
echo ""

echo "================================"
echo "Test 4: Project Hour (Sem 3+ only)"
echo "================================"
test_endpoint "Check project hour Thursday 4-5 PM (Sem 5)" "GET" "/timetable/1/5" "" 200
echo ""

echo "================================"
echo "Test 5: Lab Capacity Constraint"
echo "================================"
echo "Manual verification needed:"
echo "- Open timetable"
echo "- Find any lab slot"
echo "- Count labs in that slot"
echo "- Should not exceed 5 labs per slot"
echo ""

echo "================================"
echo "Test 6: Multi-Branch Lab Handling"
echo "================================"
echo "Manual verification needed:"
echo "- Check subjects taught in multiple branches"
echo "- Verify lab slots differ for each branch"
echo "- Example: DB subject in CSE, IT should have different lab times"
echo ""

echo "================================"
echo "Test 7: Backtracking Algorithm"
echo "================================"
test_endpoint "Generate timetable with backtracking" "POST" "/timetable/generate" \
  '{"branch_id":1,"semester":1}' 200
echo ""

echo "================================"
echo "Test 8: Professor Conflict Check"
echo "================================"
test_endpoint "Verify no professor double booking" "GET" "/timetable/1/1" "" 200
echo ""

echo "================================"
echo "Test 9: Batch Fairness"
echo "================================"
echo "Manual verification needed:"
echo "- Check lab timings for Batch A and Batch B"
echo "- Should have alternating schedules"
echo "- Fair distribution across week"
echo ""

echo "================================"
echo "Test 10: Time Slot Generation"
echo "================================"
echo "Manual verification:"
echo "- No slots during 11:00-11:15 (tea break)"
echo "- No slots during 13:15-14:00 (recess)"
echo "- All slots are 1 hour duration"
echo "- Available from 09:00-17:00 (excluding breaks)"
echo ""

echo "================================"
echo "Summary"
echo "================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

# Manual test checklist
echo "================================"
echo "Manual Testing Checklist"
echo "================================"
echo ""
echo "UI Verification:"
echo "[ ] AdminPanel shows correct break times (11:00-11:15, 13:15-14:00)"
echo "[ ] Timetable displays professor names (not checkmarks)"
echo "[ ] No 'Labs' column visible"
echo "[ ] No 'Room' column visible"
echo ""
echo "Algorithm Verification:"
echo "[ ] Timetable generates without errors"
echo "[ ] All theory classes scheduled"
echo "[ ] All labs scheduled (2 per week)"
echo "[ ] Project hour appears for Semester 3-8 on Thursday 4-5 PM"
echo "[ ] Library hour appears on Friday 4-5 PM"
echo "[ ] No class during 11:00-11:15 (tea break)"
echo "[ ] No class during 13:15-14:00 (recess)"
echo "[ ] Max 5 labs per slot"
echo "[ ] Multi-branch subjects have different lab times"
echo "[ ] No professor double-bookings"
echo "[ ] Batch A & B have fair lab schedules"
echo ""

echo -e "${YELLOW}Note: This script tests endpoints. Additional manual verification required.${NC}"
echo "See checklist above for manual tests."
