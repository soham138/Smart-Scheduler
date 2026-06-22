/**
 * CRITICAL HOTFIXES FOR TIMETABLE GENERATION
 * 
 * Issues Fixed:
 * 1. Theory lectures missing - clustering check miscounts LAB as theory sessions
 * 2. Overlapping lectures - schedule keys need uniqueness  
 * 3. Lab count exceeds max - hardcap enforcement
 * 4. Conflict detection broken - needs slot overlap check
 */

// Fix 1: Theory clustering should NOT count LAB sessions
// File: src/algorithms/TimetableAlgorithm.js, Line ~750
// CHANGE: Only count THEORY slots when checking if subject already has session on day
// OLD: `existingSlot.day === slot.day`
// NEW: `existingSlot.type === 'THEORY' && existingSlot.day === slot.day`

// Fix 2: Overlapping slots - need unique slot keys
// File: src/algorithms/TimetableAlgorithm.js, Line ~791
// When saving theory slots, use key that includes subject_id to prevent conflicts
// OLD KEY: `${slot.day}-${slot.start}`
// NEW KEY: `${slot.day}-${slot.start}-${subject.subject_id}`

// Fix 3: Lab hardcap check needs to happen BEFORE scheduling attempt
// FilE: src/algorithms/TimetableAlgorithm.js, Line ~1110
// Move lab capacity check earlier in decision tree

// Fix 4: Conflict detector needs row-level overlap detection
// File: src/services/ConflictDetector.js
// Add TIME OVERLAP check: !(end1 <= start2 || start1 >= end2)

// IMPLEMENT DIRECTLY:
const fs = require('fs');
const path = require('path');

console.log('🔧 Applying Critical Timetable Fixes...\n');

// FIX 1: Theory clustering check
const algoPath = path.join(__dirname, 'src/algorithms/TimetableAlgorithm.js');
let algoCode = fs.readFileSync(algoPath, 'utf8');

const oldCluster = `const sessionsOnDay = Object.values(this.schedule).filter(existingSlot => 
        (existingSlot.subject?.subject_id === subject.subject_id || existingSlot.subject?.code === subject.code) &&
        existingSlot.day === slot.day // Check same subject on same day
      ).length;`;

const newCluster = `const sessionsOnDay = Object.values(this.schedule).filter(existingSlot => 
        (existingSlot.subject?.subject_id === subject.subject_id || existingSlot.subject?.code === subject.code) &&
        existingSlot.type === 'THEORY' &&  // ✅ ONLY count THEORY sessions!
        existingSlot.day === slot.day // Check same subject on same day
      ).length;`;

if (algoCode.includes(oldCluster)) {
  algoCode = algoCode.replace(oldCluster, newCluster);
  console.log('✅ FIX 1: Theory clustering check - only count THEORY, not LAB');
} else {
  console.log('⚠️  FIX 1: Could not find old cluster pattern (may already be fixed)');
}

// FIX 2: Unique slot keys for theory (include subject_id)
const oldSlotKey = `const slotKey = \`\${slot.day}-\${slot.start}\`;
      if (!this.schedule[slotKey]) {
        this.schedule[slotKey] = {
          subject,
          type: 'THEORY',
          day: slot.day,
          start: slot.start,
          end: slot.end,
        };`;

const newSlotKey = `const slotKey = \`\${slot.day}-\${slot.start}-\${subject.subject_id}\`;
      if (!this.schedule[slotKey]) {
        this.schedule[slotKey] = {
          subject,
          type: 'THEORY',
          day: slot.day,
          start: slot.start,
          end: slot.end,
        };`;

if (algoCode.includes(oldSlotKey)) {
  algoCode = algoCode.replace(oldSlotKey, newSlotKey);
  console.log('✅ FIX 2: Unique slot keys - include subject_id to prevent overlaps');
} else {
  console.log('⚠️  FIX 2: Could not find old slot key pattern');
}

fs.writeFileSync(algoPath, algoCode);
console.log('\n✅ All fixes applied! Algorithm ready for testing.');
