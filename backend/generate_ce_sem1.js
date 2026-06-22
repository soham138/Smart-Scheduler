const TimetableAlgorithm = require('./src/algorithms/TimetableAlgorithm');

async function generateForCE() {
  try {
    console.log('Generating timetable for Computer Engineering, Semester 1\n');
    
    // Use the correct branch ID for Computer Engineering
    const branchId = '8e1571fa-2298-49c7-871c-ccdfdd9a6b18';
    const semester = 1;
    
    const algorithm = new TimetableAlgorithm(branchId, semester);
    const result = await algorithm.generate();
    
    if (result.success) {
      console.log('\n✅ Generation completed successfully!');
      console.log('Timetable saved:', result.timetable.length, 'slots');
      
      // Count by type
      const byType = {};
      result.timetable.forEach(slot => {
        byType[slot.type] = (byType[slot.type] || 0) + 1;
      });
      console.log('\nSlots by type:');
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    } else {
      console.log('\n❌ Generation failed:', result.error);
      if (result.conflicts) {
        console.log('\nConflicts:');
        result.conflicts.slice(0, 5).forEach(c => {
          console.log(`  - ${c}`);
        });
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
  process.exit(0);
}

generateForCE();
