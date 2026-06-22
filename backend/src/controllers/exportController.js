/**
 * Timetable Export Controller
 * Handles PDF and Excel export of timetables
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

/**
 * Export timetable as Excel
 * GET /timetable/export/excel/:branchId/:semester
 */
exports.exportExcel = async (req, res) => {
  try {
    const { branchId, semester } = req.params;

    // Fetch timetable data
    const query = `
      SELECT 
        b.name as branch_name,
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end,
        t.slot_type,
        s.code as subject_code,
        s.name as subject_name,
        p.name as professor_name,
        ba.batch_number,
        t.semester
      FROM timetable t
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN batches ba ON t.batch_id = ba.batch_id
      WHERE t.branch_id = $1 AND t.semester = $2
      ORDER BY 
        CASE t.day_of_week
          WHEN 'MON' THEN 1
          WHEN 'TUE' THEN 2
          WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4
          WHEN 'FRI' THEN 5
        END,
        t.time_slot_start,
        t.slot_type DESC
    `;

    const result = await pool.query(query, [branchId, semester]);
    const timetableData = result.rows;

    if (timetableData.length === 0) {
      return res.status(404).json({ error: 'No timetable found for this branch and semester' });
    }

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Timetable');

    // Set column widths
    worksheet.columns = [
      { header: 'Day', key: 'day_of_week', width: 12 },
      { header: 'Start Time', key: 'time_slot_start', width: 12 },
      { header: 'End Time', key: 'time_slot_end', width: 12 },
      { header: 'Type', key: 'slot_type', width: 12 },
      { header: 'Subject Code', key: 'subject_code', width: 15 },
      { header: 'Subject Name', key: 'subject_name', width: 25 },
      { header: 'Professor', key: 'professor_name', width: 20 },
      { header: 'Batch', key: 'batch_number', width: 8 }
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF366092' }
    };

    // Add data rows
    let rowNum = 2;
    const dayColors = {
      'MON': 'FFE7F0FF',
      'TUE': 'FFE7FFE7',
      'WED': 'FFFFFF00',
      'THU': 'FFFFE7E7',
      'FRI': 'FFFFE7FF'
    };

    for (const row of timetableData) {
      const excelRow = worksheet.addRow({
        day_of_week: row.day_of_week,
        time_slot_start: row.time_slot_start,
        time_slot_end: row.time_slot_end,
        slot_type: row.slot_type,
        subject_code: row.subject_code || '-',
        subject_name: row.subject_name || '-',
        professor_name: row.professor_name || '-',
        batch_number: row.batch_number || '-'
      });

      // Color code by day
      const bgColor = dayColors[row.day_of_week] || 'FFFFFFFF';
      excelRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      rowNum++;
    }

    // Add summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 20 }
    ];

    // Get summary stats
    const statsQuery = `
      SELECT 
        COUNT(*) as total_slots,
        COUNT(CASE WHEN slot_type = 'THEORY' THEN 1 END) as theory_slots,
        COUNT(CASE WHEN slot_type = 'LAB' THEN 1 END) as lab_slots,
        COUNT(DISTINCT subject_id) as total_subjects,
        COUNT(DISTINCT professor_id) as total_professors
      FROM timetable
      WHERE branch_id = $1 AND semester = $2
    `;

    const statsResult = await pool.query(statsQuery, [branchId, semester]);
    const stats = statsResult.rows[0];

    const summaryData = [
      { metric: 'Branch', value: timetableData[0].branch_name },
      { metric: 'Semester', value: semester },
      { metric: 'Total Slots', value: stats.total_slots },
      { metric: 'Theory Slots', value: stats.theory_slots },
      { metric: 'Lab Slots', value: stats.lab_slots },
      { metric: 'Total Subjects', value: stats.total_subjects },
      { metric: 'Total Professors', value: stats.total_professors },
      { metric: 'Generated On', value: new Date().toLocaleString() }
    ];

    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF366092' }
    };

    for (const data of summaryData) {
      const row = summarySheet.addRow(data);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }

    // Generate filename
    const filename = `Timetable_${timetableData[0].branch_name}_Semester${semester}_${Date.now()}.xlsx`;

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send file
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ error: 'Failed to generate Excel file', details: error.message });
  }
};

/**
 * Export timetable as PDF
 * GET /timetable/export/pdf/:branchId/:semester
 */
exports.exportPdf = async (req, res) => {
  try {
    const { branchId, semester } = req.params;

    // Fetch timetable data
    const query = `
      SELECT 
        b.name as branch_name,
        t.day_of_week,
        t.time_slot_start,
        t.time_slot_end,
        t.slot_type,
        s.code as subject_code,
        s.name as subject_name,
        p.name as professor_name,
        ba.batch_number
      FROM timetable t
      LEFT JOIN branches b ON t.branch_id = b.branch_id
      LEFT JOIN subjects s ON t.subject_id = s.subject_id
      LEFT JOIN professors p ON t.professor_id = p.professor_id
      LEFT JOIN batches ba ON t.batch_id = ba.batch_id
      WHERE t.branch_id = $1 AND t.semester = $2
      ORDER BY 
        CASE t.day_of_week
          WHEN 'MON' THEN 1
          WHEN 'TUE' THEN 2
          WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4
          WHEN 'FRI' THEN 5
        END,
        t.time_slot_start,
        t.slot_type DESC
    `;

    const result = await pool.query(query, [branchId, semester]);
    const timetableData = result.rows;

    if (timetableData.length === 0) {
      return res.status(404).json({ error: 'No timetable found' });
    }

    // Get branch name for title
    const branchName = timetableData[0].branch_name || 'Unknown Branch';

    // Create PDF
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    // Set response headers
    const filename = `Timetable_${branchName}_Semester${semester}_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe to response
    doc.pipe(res);

    // Title
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('TIMETABLE', { align: 'center' })
      .fontSize(14)
      .text(`Branch: ${branchName}`, { align: 'center' })
      .fontSize(12)
      .text(`Semester: ${semester}`, { align: 'center' })
      .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });

    doc.moveDown();

    // Table headers
    const pageWidth = doc.page.width - 80;
    const colWidth = pageWidth / 8;

    const headers = ['Day', 'Start', 'End', 'Type', 'Subject Code', 'Subject Name', 'Professor', 'Batch'];

    // Draw header background
    doc.rect(40, doc.y, pageWidth, 20).fill('#366092').stroke();

    // Draw headers
    let colX = 50;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('white');
    for (const header of headers) {
      doc.text(header, colX, doc.y - 15, { width: colWidth - 5, align: 'left' });
      colX += colWidth;
    }

    doc.fillColor('black').moveDown();

    // Draw rows
    let yPosition = doc.y;
    const rowHeight = 20;
    const maxRowsPerPage = 25;
    let rowCount = 0;

    for (const row of timetableData) {
      if (rowCount >= maxRowsPerPage) {
        doc.addPage();
        yPosition = 60;
        rowCount = 0;
      }

      // Determine row background color
      const dayColors = {
        'MON': '#E7F0FF',
        'TUE': '#E7FFE7',
        'WED': '#FFFF00',
        'THU': '#FFE7E7',
        'FRI': '#FFE7FF'
      };

      const bgColor = dayColors[row.day_of_week] || '#FFFFFF';

      // Draw row background
      doc.rect(40, yPosition, pageWidth, rowHeight).fill(bgColor).stroke();

      // Draw row data
      const rowData = [
        row.day_of_week,
        row.time_slot_start,
        row.time_slot_end,
        row.slot_type,
        row.subject_code || '-',
        row.subject_name ? row.subject_name.substring(0, 20) : '-',
        row.professor_name || '-',
        row.batch_number || '-'
      ];

      colX = 50;
      doc.fontSize(8).fillColor('black').font('Helvetica');
      for (const data of rowData) {
        doc.text(String(data), colX, yPosition + 3, { width: colWidth - 5, align: 'left' });
        colX += colWidth;
      }

      yPosition += rowHeight;
      rowCount++;
    }

    // Footer
    doc.fontSize(8).text(
      `Page ${doc.bufferedPageRange().count}`,
      40,
      doc.page.height - 30,
      { align: 'center' }
    );

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({ error: 'Failed to generate PDF file', details: error.message });
  }
};

module.exports = exports;
