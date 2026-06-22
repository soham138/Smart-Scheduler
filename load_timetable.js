const http = require('http');

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let respData = '';
      res.on('data', chunk => respData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(respData));
        } catch (e) {
          resolve({ message: respData, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// Timetable data from your table
const timetableData = [
  // AI Sem 1
  { branch: 'Artificial Intelligence', semester: 1, day: 'MON', timeStart: '09:00', timeEnd: '11:00', duration: '2 hrs', type: 'LAB', subject: 'Mathematics - I', professor: 'Dr. Rohan Verma', batch: 'Batch B' },
  { branch: 'Artificial Intelligence', semester: 1, day: 'MON', timeStart: '09:00', timeEnd: '11:00', duration: '2 hrs', type: 'LAB', subject: 'Engineering Workshop', professor: 'Dr. Sneha Kulkarni', batch: 'Batch A' },
  { branch: 'Artificial Intelligence', semester: 1, day: 'MON', timeStart: '11:15', timeEnd: '13:15', duration: '2 hrs', type: 'LAB', subject: 'Engineering Workshop', professor: 'Dr. Sneha Kulkarni', batch: 'Batch B' },
  { branch: 'Artificial Intelligence', semester: 1, day: 'MON', timeStart: '11:15', timeEnd: '13:15', duration: '2 hrs', type: 'LAB', subject: 'Mathematics - I', professor: 'Dr. Rohan Verma', batch: 'Batch A' },
  { branch: 'Artificial Intelligence', semester: 1, day: 'MON', timeStart: '14:00', timeEnd: '16:00', duration: '2 hrs', type: 'LAB', subject: 'Programming Fundamentals', professor: 'Dr. Sanjay Chopra', batch: 'Batch B' },
  { branch: 'Artificial Intelligence', semester: 1, day: 'MON', timeStart: '14:00', timeEnd: '16:00', duration: '2 hrs', type: 'LAB', subject: 'Physics', professor: 'Dr. Harsh Dixit', batch: 'Batch A' },
  { branch: 'Artificial Intelligence', semester: 1, day: 'MON', timeStart: '16:00', timeEnd: '17:00', duration: '1 hr', type: 'THEORY', subject: 'Digital Logic Design', professor: 'Dr. Meera Joshi', batch: null },
  // AI Sem 1 TUE - WED - THU - FRI (sample, truncated for brevity)
  { branch: 'Artificial Intelligence', semester: 1, day: 'TUE', timeStart: '09:00', timeEnd: '11:00', duration: '2 hrs', type: 'LAB', subject: 'Programming Fundamentals', professor: 'Dr. Sanjay Chopra', batch: 'Batch A' },
  { branch: 'Artificial Intelligence', semester: 1, day: 'TUE', timeStart: '09:00', timeEnd: '11:00', duration: '2 hrs', type: 'LAB', subject: 'Physics', professor: 'Dr. Harsh Dixit', batch: 'Batch B' },
  // Adding more realistic test data with potential conflicts
  // Dr. Vivek Mishra - Testing cross-branch conflict
  { branch: 'Artificial Intelligence', semester: 2, day: 'MON', timeStart: '16:00', timeEnd: '17:00', duration: '1 hr', type: 'THEORY', subject: 'Advanced AI', professor: 'Dr. Vivek Mishra', batch: null },
  { branch: 'Computer Engineering', semester: 6, day: 'MON', timeStart: '16:00', timeEnd: '17:00', duration: '1 hr', type: 'THEORY', subject: 'Advanced Systems', professor: 'Dr. Vivek Mishra', batch: null },
  
  // Dr. Priya Sharma - Testing cross-branch conflict
  { branch: 'Artificial Intelligence', semester: 3, day: 'MON', timeStart: '11:15', timeEnd: '13:15', duration: '2 hrs', type: 'LAB', subject: 'Database Management', professor: 'Dr. Priya Sharma', batch: 'Batch A' },
  { branch: 'Computer Engineering', semester: 3, day: 'MON', timeStart: '11:15', timeEnd: '13:15', duration: '2 hrs', type: 'LAB', subject: 'Database Systems', professor: 'Dr. Priya Sharma', batch: 'Batch B' },
  
  // Dr. Sanjay Chopra - within branch potential conflict
  { branch: 'Artificial Intelligence', semester: 1, day: 'WED', timeStart: '11:15', timeEnd: '12:15', duration: '1 hr', type: 'THEORY', subject: 'Programming Fundamentals', professor: 'Dr. Sanjay Chopra', batch: null },
  { branch: 'Computer Engineering', semester: 1, day: 'WED', timeStart: '11:15', timeEnd: '12:15', duration: '1 hr', type: 'THEORY', subject: 'Programming Fundamentals', professor: 'Dr. Sanjay Chopra', batch: null },
];

async function loadData() {
  try {
    console.log('📥 Loading timetable data into database...\n');
    
    // First get branch IDs
    const branchesRes = await makeRequest('GET', '/api/admin/branches', null);
    const branches = {};
    (branchesRes.data || []).forEach(b => branches[b.name] = b.branch_id);
    
    if (Object.keys(branches).length === 0) {
      console.log('❌ No branches found in database');
      return;
    }

    let addedCount = 0;
    let errorCount = 0;

    for (const entry of timetableData) {
      const branchId = branches[entry.branch];
      if (!branchId) {
        console.log(`⚠️  Branch not found: ${entry.branch}`);
        errorCount++;
        continue;
      }

      const payload = {
        branchId: branchId,
        semester: entry.semester,
        day: entry.day,
        timeStart: entry.timeStart,
        timeEnd: entry.timeEnd,
        type: entry.type,
        subjectName: entry.subject,
        professorName: entry.professor,
        batchName: entry.batch
      };

      const result = await makeRequest('POST', '/api/timetable/add', payload);
      
      if (result.success || result.timetable_id) {
        addedCount++;
        console.log(`✅ Added: ${entry.branch} Sem${entry.semester} - ${entry.day} ${entry.timeStart}: ${entry.subject} (${entry.professor})`);
      } else {
        errorCount++;
        console.log(`❌ Failed: ${entry.branch} - ${result.message || 'Unknown error'}`);
      }
    }

    console.log(`\n📊 Summary: ${addedCount} entries added, ${errorCount} errors`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

loadData();
