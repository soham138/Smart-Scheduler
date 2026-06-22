/**
 * ENHANCED THEORY-LAB CONFLICT PREVENTION
 * This replaces the broken detectAndFixBatchConflicts() function
 */

async enhancedTheoryLabConflictPrevention() {
  console.log('[Algorithm] Checking for THEORY-LAB conflicts...');
  
  let conflictsFixed = 0;
  let details = [];

  // Step 1: Build a map of all THEORY slots (these have NO batch - for all students)
  const theorySlots = {};
  for (const [key, slot] of Object.entries(this.schedule)) {
    if (slot.type === 'THEORY') {
      const slotKey = `${slot.subject?.id}_${slot.day}_${slot.start}-${slot.end}`;
      theorySlots[slotKey] = {
        ...slot,
        key: key,
        isBatch: false // THEORY has no specific batch
      };
    }
  }

  // Step 2: Check every LAB slot against THEORY slots
  const labsToRelocate = [];
  
  for (const [key, slot] of Object.entries(this.schedule)) {
    if (slot.type !== 'LAB') continue;

    // For this LAB (specific batch), find all THEORY for same subject/day/time
    for (const [theoryKey, theorySlot] of Object.entries(theorySlots)) {
      // Same subject? Same day? Time overlap?
      if (
        slot.subject?.id === theorySlot.subject?.id &&
        slot.day === theorySlot.day &&
        this.timeOverlaps(slot.start, slot.end, theorySlot.start, theorySlot.end)
      ) {
        console.warn(`[CONFLICT] Batch ${slot.batch} LAB conflicts with THEORY on ${slot.day}`);
        console.warn(`  - ${slot.subject?.code} LAB (Batch ${slot.batch}): ${slot.start}-${slot.end}`);
        console.warn(`  - ${theorySlot.subject?.code} THEORY (All Students): ${theorySlot.start}-${theorySlot.end}`);
        
        // Solution: Move LAB to a different available slot (don't delete THEORY)
        labsToRelocate.push({
          labKey: key,
          labSlot: slot,
          conflictWith: theorySlot
        });

        conflictsFixed++;
      }
    }
  }

  // Step 3: Try to relocate conflicting LAB slots
  for (const conflict of labsToRelocate) {
    const newSlot = this.findAvailableSlotForLab(conflict.labSlot);
    
    if (newSlot) {
      // Move LAB to new slot
      delete this.schedule[conflict.labKey];
      const newKey = `${newSlot.day}-${newSlot.start}-${newSlot.end}-LAB-${conflict.labSlot.batch}`;
      this.schedule[newKey] = {
        ...conflict.labSlot,
        start: newSlot.start,
        end: newSlot.end,
        day: newSlot.day
      };

      details.push({
        issue: `LAB conflict: Batch ${conflict.labSlot.batch} ${conflict.labSlot.subject?.code}`,
        resolution: `Moved from ${conflict.labSlot.day} ${conflict.labSlot.start} to ${newSlot.day} ${newSlot.start}`
      });
      
      console.log(`[FIXED] Moved LAB to ${newSlot.day} ${newSlot.start}`);
    } else {
      details.push({
        issue: `LAB conflict: Batch ${conflict.labSlot.batch} ${conflict.labSlot.subject?.code}`,
        resolution: 'Could not find available slot - conflict remains'
      });
      console.error(`[FAILED] Could not find available slot for LAB`);
    }
  }

  return {
    conflictsFixed,
    details,
    removedSlots: 0 // We don't delete slots anymore!
  };
}

/**
 * Find available slot for a LAB session
 * Tries: Block 2 (11:15-13:15) → Block 3 (14:00-16:00) → Different days
 */
findAvailableSlotForLab(labSlot) {
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  
  // Try to find slot on different day first (less disruptive)
  for (const day of days) {
    if (day === labSlot.day) continue; // Skip current day
    
    // Try Block 2
    if (!this.isSlotOccupied(day, '11:15', '13:15')) {
      return { day, start: '11:15', end: '13:15' };
    }
    
    // Try Block 3
    if (!this.isSlotOccupied(day, '14:00', '16:00')) {
      return { day, start: '14:00', end: '16:00' };
    }
  }
  
  // If no other day available, try different time on same day
  if (!this.isSlotOccupied(labSlot.day, '11:15', '13:15')) {
    return { day: labSlot.day, start: '11:15', end: '13:15' };
  }
  
  if (!this.isSlotOccupied(labSlot.day, '14:00', '16:00')) {
    return { day: labSlot.day, start: '14:00', end: '16:00' };
  }
  
  return null; // No available slot
}

/**
 * Check if time slot is occupied
 */
isSlotOccupied(day, start, end) {
  for (const [key, slot] of Object.entries(this.schedule)) {
    if (
      slot.day === day &&
      this.timeOverlaps(start, end, slot.start, slot.end) &&
      ['THEORY', 'LAB'].includes(slot.type)
    ) {
      return true;
    }
  }
  return false;
}
