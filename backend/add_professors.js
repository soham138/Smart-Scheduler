#!/usr/bin/env node
/**
 * Add 32 professors to database
 */

const pool = require('./src/config/db');

async function addProfessors() {
  const client = await pool.connect();
  
  try {
    console.log('👨‍🏫 Adding 32 professors to database...\n');

    const professors = [
      // CS Department (8 professors)
      { name: 'Dr. Rajesh Kumar', email: 'rajesh.kumar@college.edu', department: 'CS', phone: '9876543210' },
      { name: 'Dr. Priya Sharma', email: 'priya.sharma@college.edu', department: 'CS', phone: '9876543211' },
      { name: 'Dr. Amit Patel', email: 'amit.patel@college.edu', department: 'CS', phone: '9876543212' },
      { name: 'Dr. Neha Singh', email: 'neha.singh@college.edu', department: 'CS', phone: '9876543213' },
      { name: 'Dr. Vikram Desai', email: 'vikram.desai@college.edu', department: 'CS', phone: '9876543214' },
      { name: 'Dr. Anjali Gupta', email: 'anjali.gupta@college.edu', department: 'CS', phone: '9876543215' },
      { name: 'Dr. Rohan Verma', email: 'rohan.verma@college.edu', department: 'CS', phone: '9876543216' },
      { name: 'Dr. Kavya Nair', email: 'kavya.nair@college.edu', department: 'CS', phone: '9876543217' },
      
      // EE Department (8 professors)
      { name: 'Dr. Sanjay Chopra', email: 'sanjay.chopra@college.edu', department: 'EE', phone: '9876543218' },
      { name: 'Dr. Meera Joshi', email: 'meera.joshi@college.edu', department: 'EE', phone: '9876543219' },
      { name: 'Dr. Harsh Dixit', email: 'harsh.dixit@college.edu', department: 'EE', phone: '9876543220' },
      { name: 'Dr. Ritu Bansal', email: 'ritu.bansal@college.edu', department: 'EE', phone: '9876543221' },
      { name: 'Dr. Anil Kumar', email: 'anil.kumar@college.edu', department: 'EE', phone: '9876543222' },
      { name: 'Dr. Divya Pandey', email: 'divya.pandey@college.edu', department: 'EE', phone: '9876543223' },
      { name: 'Dr. Sameer Malik', email: 'sameer.malik@college.edu', department: 'EE', phone: '9876543224' },
      { name: 'Dr. Nidhi Arora', email: 'nidhi.arora@college.edu', department: 'EE', phone: '9876543225' },
      
      // MATH Department (6 professors)
      { name: 'Dr. Manish Tiwari', email: 'manish.tiwari@college.edu', department: 'MATH', phone: '9876543226' },
      { name: 'Dr. Pooja Saxena', email: 'pooja.saxena@college.edu', department: 'MATH', phone: '9876543227' },
      { name: 'Dr. Rahul Deshmukh', email: 'rahul.deshmukh@college.edu', department: 'MATH', phone: '9876543228' },
      { name: 'Dr. Sneha Kulkarni', email: 'sneha.kulkarni@college.edu', department: 'MATH', phone: '9876543229' },
      { name: 'Dr. Vivek Mishra', email: 'vivek.mishra@college.edu', department: 'MATH', phone: '9876543230' },
      { name: 'Dr. Akshay Singh', email: 'akshay.singh@college.edu', department: 'MATH', phone: '9876543231' },
      
      // PHYS Department (5 professors)
      { name: 'Dr. Suresh Prabhu', email: 'suresh.prabhu@college.edu', department: 'PHYS', phone: '9876543232' },
      { name: 'Dr. Geeta Nair', email: 'geeta.nair@college.edu', department: 'PHYS', phone: '9876543233' },
      { name: 'Dr. Isha Kapoor', email: 'isha.kapoor@college.edu', department: 'PHYS', phone: '9876543234' },
      { name: 'Dr. Nitin Rao', email: 'nitin.rao@college.edu', department: 'PHYS', phone: '9876543235' },
      { name: 'Dr. Ananya Chatterjee', email: 'ananya.chatterjee@college.edu', department: 'PHYS', phone: '9876543236' },
      
      // CHEM Department (5 professors)
      { name: 'Dr. Rajiv Patel', email: 'rajiv.patel@college.edu', department: 'CHEM', phone: '9876543237' },
      { name: 'Dr. Shruti Jain', email: 'shruti.jain@college.edu', department: 'CHEM', phone: '9876543238' },
      { name: 'Dr. Vikram Kulkarni', email: 'vikram.kulkarni@college.edu', department: 'CHEM', phone: '9876543239' },
      { name: 'Dr. Deepika Sharma', email: 'deepika.sharma@college.edu', department: 'CHEM', phone: '9876543240' },
      { name: 'Dr. Arjun Banerjee', email: 'arjun.banerjee@college.edu', department: 'CHEM', phone: '9876543241' }
    ];

    let addedCount = 0;

    for (const prof of professors) {
      try {
        const result = await client.query(
          `INSERT INTO professors (name, email, department, phone) 
           VALUES ($1, $2, $3, $4) 
           RETURNING professor_id, name, email`,
          [prof.name, prof.email, prof.department, prof.phone]
        );
        
        console.log(`✅ ${result.rows[0].name}`);
        addedCount++;
      } catch (error) {
        console.log(`⚠️  ${prof.name}: ${error.message.split('\n')[0]}`);
      }
    }

    // Get final count
    const countResult = await client.query('SELECT COUNT(*) as count FROM professors');
    const totalProfessors = countResult.rows[0].count;

    console.log('\n' + '='.repeat(60));
    console.log(`📊 SUMMARY:`);
    console.log(`   Added: ${addedCount} new professors`);
    console.log(`   Total professors in database: ${totalProfessors}`);
    console.log('='.repeat(60));

    // Show distribution by department
    console.log('\n👥 PROFESSORS BY DEPARTMENT:');
    const deptResult = await client.query(`
      SELECT department, COUNT(*) as count 
      FROM professors 
      GROUP BY department 
      ORDER BY department
    `);

    deptResult.rows.forEach(row => {
      console.log(`   ${row.department}: ${row.count} professors`);
    });

    console.log('\n✅ Professors added successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

addProfessors();
