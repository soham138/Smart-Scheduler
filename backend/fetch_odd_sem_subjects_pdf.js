const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function fetchOddSemesterSubjects() {
  try {
    // Query to get odd semester subjects with professor assignments for all branches
    const query = `
      SELECT 
        b.name as branch_name,
        s.semester,
        s.code as subject_code,
        s.name as subject_name,
        s.type as subject_type,
        s.weekly_lecture_count,
        s.weekly_lab_count,
        STRING_AGG(p.name, ', ') as professors,
        s.credits
      FROM subjects s
      LEFT JOIN subjects_branches sb ON s.subject_id = sb.subject_id
      LEFT JOIN branches b ON sb.branch_id = b.branch_id
      LEFT JOIN professors_subjects ps ON s.subject_id = ps.subject_id
      LEFT JOIN professors p ON ps.professor_id = p.professor_id
      WHERE s.semester IN (1, 3, 5, 7)
      GROUP BY b.name, s.semester, s.code, s.name, s.type, s.weekly_lecture_count, s.weekly_lab_count, s.credits, s.subject_id
      ORDER BY b.name, s.semester, s.code
    `;

    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error fetching data from database:', error);
    throw error;
  }
}

async function generatePDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', landscape: true });
      const fileName = `Odd_Semester_Subjects_${new Date().toISOString().split('T')[0]}.pdf`;
      const filePath = path.join(__dirname, fileName);
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Title
      doc.fontSize(18).font('Helvetica-Bold').text('ODD SEMESTER SUBJECTS WITH PROFESSOR ASSIGNMENTS', {
        align: 'center',
        margin: 40,
      });

      doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, {
        align: 'center',
      });

      doc.moveDown();

      // Group data by branch and semester
      const groupedData = {};
      data.forEach(row => {
        const key = `${row.branch_name} - Semester ${row.semester}`;
        if (!groupedData[key]) {
          groupedData[key] = [];
        }
        groupedData[key].push(row);
      });

      // Create table for each branch-semester combination
      Object.keys(groupedData)
        .sort()
        .forEach(key => {
          doc.fontSize(12).font('Helvetica-Bold').text(key);
          doc.moveDown(0.3);

          const tableData = groupedData[key];
          const rows = [
            ['Code', 'Subject Name', 'Type', 'Lectures', 'Labs', 'Credits', 'Assigned Professors'],
          ];

          tableData.forEach(row => {
            rows.push([
              row.subject_code || 'N/A',
              row.subject_name || 'N/A',
              row.subject_type || 'N/A',
              row.weekly_lecture_count || '0',
              row.weekly_lab_count || '0',
              row.credits || '0',
              row.professors || 'Not Assigned',
            ]);
          });

          drawTable(doc, rows);
          doc.moveDown(1);
        });

      doc.end();

      stream.on('finish', () => {
        console.log(`\n✅ PDF generated successfully: ${filePath}`);
        resolve(filePath);
      });

      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

function drawTable(doc, rows) {
  const pageWidth = doc.page.width - 80;
  const colWidthPercentages = [8, 25, 10, 10, 8, 8, 31];
  const colWidths = colWidthPercentages.map(p => (pageWidth * p) / 100);
  const rowHeight = 20;
  let currentY = doc.y;

  // Draw header
  const headerFillColor = '#3498db';
  doc.fillColor(headerFillColor).rect(40, currentY, pageWidth, rowHeight).fill();

  let currentX = 40;
  doc.fillColor('white').font('Helvetica-Bold').fontSize(9);

  rows[0].forEach((header, i) => {
    doc.text(header, currentX + 2, currentY + 4, {
      width: colWidths[i] - 4,
      height: rowHeight - 4,
      align: 'left',
      valign: 'top',
    });
    currentX += colWidths[i];
  });

  currentY += rowHeight;

  // Draw rows
  doc.font('Helvetica').fontSize(8).fillColor('black');
  for (let i = 1; i < rows.length; i++) {
    const isEvenRow = i % 2 === 0;
    const bgColor = isEvenRow ? '#f5f5f5' : 'white';

    doc.fillColor(bgColor).rect(40, currentY, pageWidth, rowHeight).fill();
    doc.strokeColor('#ccc').lineWidth(0.5).rect(40, currentY, pageWidth, rowHeight).stroke();

    currentX = 40;
    doc.fillColor('black');

    rows[i].forEach((cell, j) => {
      const text = String(cell).substring(0, 50);
      doc.text(text, currentX + 2, currentY + 4, {
        width: colWidths[j] - 4,
        height: rowHeight - 4,
        align: 'left',
        valign: 'top',
      });
      currentX += colWidths[j];
    });

    currentY += rowHeight;

    // Check if we need a new page
    if (currentY > doc.page.height - 60) {
      doc.addPage({ margin: 40, size: 'A4', landscape: true });
      currentY = 40;
    }
  }
}

async function main() {
  try {
    console.log('📊 Fetching odd semester subjects with professor assignments...');
    const data = await fetchOddSemesterSubjects();

    if (data.length === 0) {
      console.log('⚠️ No data found for odd semesters');
      await pool.end();
      return;
    }

    console.log(`✅ Found ${data.length} records`);
    console.log('\n📄 Generating PDF...');
    const filePath = await generatePDF(data);

    // Display summary
    const branches = [...new Set(data.map(d => d.branch_name))];
    console.log(`\n📈 Summary:`);
    console.log(`   Branches: ${branches.join(', ')}`);
    console.log(`   Odd Semesters: 1, 3, 5, 7`);
    console.log(`   Total Records: ${data.length}`);

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
