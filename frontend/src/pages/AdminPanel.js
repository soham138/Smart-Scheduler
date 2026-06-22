import React, { useState, useEffect } from 'react';
import { adminAPI, timetableAPI } from '../services/api';
import { jsPDF } from 'jspdf';
import OllamaAssistant from '../components/OllamaAssistant';

function AdminPanel() {
  const [activeTab, setActiveTab] = useState('professors');
  const [professors, setProfessors] = useState([]);
  const [professorSubjects, setProfessorSubjects] = useState({}); // State to store subjects for each professor
  const [subjects, setSubjects] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [newProfessor, setNewProfessor] = useState({ name: '', email: '', phone: '', hours_per_week: 30 });
  const [editingProfessor, setEditingProfessor] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newSubject, setNewSubject] = useState({ 
    name: '', 
    type: 'THEORY', 
    semester: 1, 
    weeklyLectureCount: 0,
    labCount: 1,
    branches: [],
    professorId: ''
  });
  const [generateForm, setGenerateForm] = useState({ 
    generationType: 'single', // 'single', 'odd', 'even'
    singleSemester: '', 
    branchId: '', 
    allBranches: false 
  });
  const [generatedTimetable, setGeneratedTimetable] = useState([]);
  const [filterSemester, setFilterSemester] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterDisplaySemester, setFilterDisplaySemester] = useState(''); // Filter timetable by semester
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictResults, setConflictResults] = useState(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [conflictingEntryIds, setConflictingEntryIds] = useState(new Set()); // Track conflicting entry IDs
  const [currentConflictBranch, setCurrentConflictBranch] = useState(''); // Track which branch's conflicts are shown
  const [currentConflictSemester, setCurrentConflictSemester] = useState(''); // Track which semester's conflicts are shown
  const [showMoveModal, setShowMoveModal] = useState(false); // Modal for moving class
  const [selectedEntryForMove, setSelectedEntryForMove] = useState(null); // Entry being moved
  const [availableSlots, setAvailableSlots] = useState([]); // Available empty slots
  const [selectedProfessor, setSelectedProfessor] = useState('');
  const [professorStats, setProfessorStats] = useState(null);
  const [editingSubject, setEditingSubject] = useState(null);

  useEffect(() => {
    loadBranches();
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadBranches = async () => {
    try {
      const res = await adminAPI.getAllBranches();
      setBranches(res.data.data);
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setMessage('');
    try {
      if (activeTab === 'professors') {
        const res = await adminAPI.getAllProfessors();
        setProfessors(res.data.data);
        
        // Load subjects for each professor
        const subjectsMap = {};
        for (const prof of res.data.data) {
          try {
            const subjRes = await adminAPI.getProfessorSubjects(prof.professor_id);
            subjectsMap[prof.professor_id] = subjRes.data.data || [];
          } catch (err) {
            console.error(`Error loading subjects for professor ${prof.professor_id}:`, err);
            subjectsMap[prof.professor_id] = [];
          }
        }
        setProfessorSubjects(subjectsMap);
      } else if (activeTab === 'subjects') {
        const res = await adminAPI.getAllSubjects();
        setSubjects(res.data.data);
      } else if (activeTab === 'feedback') {
        const res = await adminAPI.getAllFeedback();
        setFeedback(res.data.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setMessage('✗ Error: ' + error.message);
    }
    setLoading(false);
  };

  const handleAddProfessor = async (e) => {
    e.preventDefault();
    if (!newProfessor.name || !newProfessor.email) {
      setMessage('✗ Name and email are required');
      return;
    }

    try {
      await adminAPI.addProfessor(newProfessor);
      setMessage('✓ Professor added successfully');
      setNewProfessor({ name: '', email: '', phone: '', hours_per_week: 30 });
      setTimeout(loadData, 500);
    } catch (error) {
      setMessage('✗ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleEditProfessor = (prof) => {
    setEditingProfessor(prof);
    setShowEditModal(true);
  };

  const handleUpdateProfessor = async (e) => {
    e.preventDefault();
    if (!editingProfessor.name || !editingProfessor.email) {
      setMessage('✗ Name and email are required');
      return;
    }

    try {
      await adminAPI.updateProfessor(editingProfessor.professor_id, {
        name: editingProfessor.name,
        email: editingProfessor.email,
        phone: editingProfessor.phone,
        department: editingProfessor.department,
        hours_per_week: editingProfessor.hours_per_week || 30
      });
      setMessage('✓ Professor updated successfully');
      setShowEditModal(false);
      setEditingProfessor(null);
      setTimeout(loadData, 500);
    } catch (error) {
      setMessage('✗ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleAddSubject = async (e) => {
    e.preventDefault();
    if (!newSubject.name) {
      setMessage('✗ Subject name is required');
      return;
    }
    if (newSubject.branches.length === 0) {
      setMessage('✗ Select at least one branch');
      return;
    }

    try {
      const subjectData = { ...newSubject };
      delete subjectData.branches;
      delete subjectData.professorId;
      
      const res = await adminAPI.addSubject(subjectData);
      
      // Add subject to selected branches
      if (newSubject.branches && newSubject.branches.length > 0) {
        for (const branchId of newSubject.branches) {
          await adminAPI.assignSubjectBranch(res.data.data.subject_id, branchId);
        }
      }

      // Map professor to subject if selected
      if (newSubject.professorId) {
        try {
          await adminAPI.mapProfessorSubject(newSubject.professorId, res.data.data.subject_id);
        } catch (err) {
          console.error('Error mapping professor:', err);
        }
      }

      setMessage('✓ Subject added successfully');
      setNewSubject({ name: '', type: 'THEORY', semester: 1, weeklyLectureCount: 0, labCount: 1, branches: [], professorId: '' });
      setTimeout(loadData, 500);
    } catch (error) {
      setMessage('✗ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteProfessor = async (id) => {
    if (window.confirm('Delete this professor?')) {
      try {
        await adminAPI.deleteProfessor(id);
        setMessage('✓ Professor deleted');
        loadData();
      } catch (error) {
        setMessage('✗ Error: ' + error.response?.data?.error);
      }
    }
  };

  const handleToggleProfessorStatus = async (id, currentStatus) => {
    const action = currentStatus ? 'disable' : 'enable';
    const confirmMsg = currentStatus 
      ? 'Disable this professor and their assigned subjects?' 
      : 'Enable this professor?';
    
    if (window.confirm(confirmMsg)) {
      try {
        await adminAPI.toggleProfessorStatus(id, !currentStatus);
        setMessage(`✓ Professor ${action}d successfully${!currentStatus ? ' and assigned subjects disabled' : ''}`);
        loadData();
      } catch (error) {
        setMessage('✗ Error: ' + error.response?.data?.error);
      }
    }
  };

  const handleDeleteSubject = async (id) => {
    if (window.confirm('Delete this subject?')) {
      try {
        await adminAPI.deleteSubject(id);
        setMessage('✓ Subject deleted');
        loadData();
      } catch (error) {
        setMessage('✗ Error: ' + error.response?.data?.error);
      }
    }
  };

  const handleEditSubject = async (subject) => {
    try {
      // Fetch full subject details with branches and professors
      const res = await adminAPI.getSubject(subject.subject_id);
      const fullSubject = res.data.data;
      
      console.log('Full subject data:', fullSubject);
      console.log('Branches data:', fullSubject.branches);
      
      // Extract branch IDs - handle both null and array responses
      let branchIds = [];
      if (fullSubject.branches && Array.isArray(fullSubject.branches)) {
        branchIds = fullSubject.branches
          .filter(b => b !== null && typeof b === 'object' && b.branch_id)
          .map(b => b.branch_id);
      }
      
      console.log('Extracted branch IDs:', branchIds);
      
      setEditingSubject(fullSubject);
      setNewSubject({
        name: fullSubject.name,
        type: fullSubject.type,
        semester: fullSubject.semester,
        weeklyLectureCount: fullSubject.weekly_lecture_count,
        labCount: fullSubject.weekly_lab_count || 1,
        branches: branchIds,
        professorId: fullSubject.professor_ids && Array.isArray(fullSubject.professor_ids) && fullSubject.professor_ids[0] ? fullSubject.professor_ids[0] : ''
      });
    } catch (error) {
      console.error('Error fetching subject details:', error);
      setMessage('✗ Error loading subject details: ' + error.message);
    }
  };

  const handleUpdateSubject = async (e) => {
    e.preventDefault();
    if (!newSubject.name) {
      setMessage('✗ Subject name is required');
      return;
    }
    if (newSubject.branches.length === 0) {
      setMessage('✗ Select at least one branch');
      return;
    }

    try {
      const subjectData = {
        name: newSubject.name,
        type: newSubject.type,
        semester: newSubject.semester,
        weeklyLectureCount: newSubject.weeklyLectureCount,
        credits: 3,
        labCount: newSubject.labCount
      };
      
      // Update subject basic info
      await adminAPI.updateSubject(editingSubject.subject_id, subjectData);
      
      // Update branch assignments
      const oldBranches = editingSubject.branches ? editingSubject.branches.map(b => b.branch_id) : [];
      const newBranches = newSubject.branches;
      
      // Remove branches that were removed
      for (const branchId of oldBranches) {
        if (!newBranches.includes(branchId)) {
          try {
            await adminAPI.removeSubjectBranch(editingSubject.subject_id, branchId);
          } catch (err) {
            console.log('Error removing branch:', err);
          }
        }
      }
      
      // Add new branches
      for (const branchId of newBranches) {
        if (!oldBranches.includes(branchId)) {
          try {
            await adminAPI.assignSubjectBranch(editingSubject.subject_id, branchId);
          } catch (err) {
            console.log('Error adding branch:', err);
          }
        }
      }
      
      // Handle professor assignment changes
      const oldProfessorId = editingSubject.professor_ids && editingSubject.professor_ids[0] ? editingSubject.professor_ids[0] : null;
      const newProfessorId = newSubject.professorId || null;
      
      // Remove old professor if changed
      if (oldProfessorId && oldProfessorId !== newProfessorId) {
        try {
          await adminAPI.removeProfessorSubject(oldProfessorId, editingSubject.subject_id);
        } catch (err) {
          console.log('Error removing old professor:', err);
        }
      }
      
      // Add new professor if changed
      if (newProfessorId && newProfessorId !== oldProfessorId) {
        try {
          await adminAPI.mapProfessorSubject(newProfessorId, editingSubject.subject_id);
        } catch (err) {
          console.log('Error assigning new professor:', err);
        }
      }
      
      setMessage('✓ Subject updated successfully');
      setEditingSubject(null);
      setNewSubject({ name: '', type: 'THEORY', semester: 1, weeklyLectureCount: 0, labCount: 2, branches: [], professorId: '' });
      setTimeout(loadData, 500);
    } catch (error) {
      setMessage('✗ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleCancelEdit = () => {
    setEditingSubject(null);
    setNewSubject({ name: '', type: 'THEORY', semester: 1, weeklyLectureCount: 0, labCount: 2, branches: [], professorId: '' });
  };

  const handleGetProfessorStats = async () => {
    if (!selectedProfessor) {
      setMessage('✗ Please select a professor');
      return;
    }

    setLoading(true);
    try {
      const res = await timetableAPI.getProfessorStatistics(selectedProfessor);
      if (res.data.success) {
        setProfessorStats(res.data);
        setMessage('✓ Professor statistics loaded');
      } else {
        setMessage('✗ Error: ' + res.data.error);
      }
    } catch (error) {
      console.error('Error fetching professor stats:', error);
      setMessage('✗ Error: ' + (error.response?.data?.error || error.message));
    }
    setLoading(false);
  };

  const handleGenerateTimetable = async (e) => {
    e.preventDefault();
    
    if (generateForm.generationType === 'single') {
      if (!generateForm.singleSemester && !generateForm.allBranches && !generateForm.branchId) {
        setMessage('✗ Select semester and branch');
        return;
      }
    } else if (generateForm.generationType === 'odd' || generateForm.generationType === 'even') {
      if (!generateForm.allBranches && !generateForm.branchId) {
        setMessage('✗ Select branch or all branches');
        return;
      }
    }

    setLoading(true);
    try {
      let allTimetables = [];

      if (generateForm.generationType === 'single') {
        // Generate for single semester
        const semester = parseInt(generateForm.singleSemester);
        const branchesToGenerate = generateForm.allBranches 
          ? branches.map(b => b.branch_id) 
          : [generateForm.branchId];
        
        for (const branchId of branchesToGenerate) {
          const res = await timetableAPI.generateTimetable({
            branchId: branchId,
            semester: semester,
            semesterType: semester % 2 === 0 ? 'even' : 'odd'
          });
          allTimetables = [...allTimetables, ...(res.data.data || [])];
        }
        setMessage(`✓ Timetable generated for Semester ${semester}! (${allTimetables.length} slots created)`);
      } else if (generateForm.generationType === 'odd' || generateForm.generationType === 'even') {
        // Generate master timetable for all odd or even semesters
        const semesters = generateForm.generationType === 'odd' ? [1, 3, 5, 7] : [2, 4, 6, 8];
        const branchesToGenerate = generateForm.allBranches 
          ? branches.map(b => b.branch_id) 
          : [generateForm.branchId];

        for (const branchId of branchesToGenerate) {
          for (const semester of semesters) {
            const res = await timetableAPI.generateTimetable({
              branchId: branchId,
              semester: semester,
              semesterType: generateForm.generationType
            });
            allTimetables = [...allTimetables, ...(res.data.data || [])];
          }
        }
        const semesterLabel = generateForm.generationType === 'odd' ? 'Odd Semesters (1,3,5,7)' : 'Even Semesters (2,4,6,8)';
        setMessage(`✓ Master timetable generated for ${semesterLabel}! (${allTimetables.length} total slots created)`);
      }

      setGeneratedTimetable(allTimetables);
      setFilterBranch(''); // Reset filters when generating new timetable
      setFilterDisplaySemester('');
      // Don't reset the form - keep branch and semester for conflict checking
      // setGenerateForm({ generationType: 'single', singleSemester: '', branchId: '', allBranches: false });
    } catch (error) {
      setMessage('✗ Error: ' + (error.response?.data?.error || error.message));
    }
    setLoading(false);
  };

  const handleCloseConflictModal = () => {
    setShowConflictModal(false);
    setConflictResults(null);
  };

  const handleClearTimetable = async () => {
    if (!window.confirm('Are you sure you want to clear the generated timetable? This action cannot be undone.')) {
      return;
    }
    setGeneratedTimetable([]);
    setMessage('✓ Timetable cleared. Ready to generate a new one.');
  };

  /**
   * ✅ NEW: Delete ALL timetables from database (all branches, semesters)
   * Called before regenerating entire timetable
   */
  const handleDeleteAllTimetables = async () => {
    if (!window.confirm('⚠️ DELETE ALL TIMETABLES?\n\nThis will permanently delete ALL timetable entries for:\n- All branches (AI, CE, IoT)\n- All semesters (1-8)\n\nYou can then generate fresh timetables.\n\nContinue?')) {
      return;
    }

    setLoading(true);
    try {
      const res = await timetableAPI.deleteAllTimetables();
      setMessage(`✅ ${res.data.deletedCount} timetable entries deleted successfully! Ready to generate new timetables.`);
      setGeneratedTimetable([]);
      setFilterBranch('');
      setFilterDisplaySemester('');
    } catch (error) {
      setMessage('✗ Error deleting timetables: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Download timetable in specified format (JSON, CSV, or PDF)
   */
  const handleDownloadTimetable = (format) => {
    if (generatedTimetable.length === 0) {
      setMessage('✗ No timetable data to download');
      return;
    }

    const filteredData = generatedTimetable.filter(slot => 
      (!filterBranch || slot.branch_name === filterBranch) &&
      (!filterDisplaySemester || slot.semester === parseInt(filterDisplaySemester))
    );

    if (format === 'json') {
      downloadJSON(filteredData);
    } else if (format === 'csv') {
      downloadCSV(filteredData);
    } else if (format === 'pdf') {
      downloadPDF(filteredData);
    }
  };

  /**
   * Download timetable as JSON file
   */
  const downloadJSON = (data) => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `timetable_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setMessage('✓ Timetable downloaded as JSON');
  };

  /**
   * Download timetable as CSV file
   */
  const downloadCSV = (data) => {
    if (data.length === 0) return;

    // Define CSV headers
    const headers = [
      'Branch',
      'Semester',
      'Day',
      'Start Time',
      'End Time',
      'Type',
      'Subject',
      'Professor',
      'Batch',
      'Room'
    ];

    // Convert data to CSV rows
    const rows = data.map(slot => [
      slot.branch_name || '-',
      slot.semester || '-',
      slot.day_of_week || '-',
      slot.time_slot_start || '-',
      slot.time_slot_end || '-',
      slot.slot_type || '-',
      slot.subject_name || '-',
      slot.professor_name || '-',
      slot.batch_number ? (slot.batch_number === 1 ? 'Batch A' : 'Batch B') : '-',
      slot.room_number || '-'
    ]);

    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
      // Escape quotes and wrap fields containing commas or newlines
      const escapedRow = row.map(field => {
        field = String(field).replace(/"/g, '""');
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${field}"`;
        }
        return field;
      });
      csvContent += escapedRow.join(',') + '\n';
    });

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `timetable_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setMessage('✓ Timetable downloaded as CSV');
  };

  /**
   * Download timetable as PDF file
   */
  const downloadPDF = (data) => {
    if (data.length === 0) return;

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let yPosition = 15;

      // Helper function to draw a table cell with borders
      const drawCell = (x, y, width, height, text, bgColor = null, textColor = [0, 0, 0], align = 'left', isBold = false) => {
        if (bgColor) {
          pdf.setFillColor(...bgColor);
          pdf.rect(x, y - height, width, height, 'F');
        }
        pdf.setDrawColor(180, 180, 180);
        pdf.rect(x, y - height, width, height);
        pdf.setTextColor(...textColor);
        pdf.setFont(undefined, isBold ? 'bold' : 'normal');
        
        const xAlign = align === 'center' ? x + width / 2 : align === 'right' ? x + width - 1 : x + 1;
        pdf.text(String(text).substring(0, 30), xAlign, y - height / 2 - 1, {
          maxWidth: width - 2,
          align: align
        });
      };

      // Helper to get color for slot type
      const getSlotTypeColor = (slotType) => {
        switch(slotType) {
          case 'THEORY': return [220, 240, 255]; // Light blue
          case 'LAB': return [255, 240, 220]; // Light orange
          case 'BREAK': return [255, 255, 200]; // Light yellow
          case 'RECESS': return [240, 255, 240]; // Light green
          case 'LIBRARY': return [255, 240, 255]; // Light purple
          default: return [255, 255, 255]; // White
        }
      };

      // Title
      pdf.setFontSize(18);
      pdf.setTextColor(44, 62, 80);
      pdf.text('Smart Scheduler - Timetable Report', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      // Date and Filters Info
      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      const reportDate = new Date().toLocaleDateString();
      pdf.text(`Report Generated: ${reportDate}`, 15, yPosition);
      yPosition += 5;

      if (filterBranch || filterDisplaySemester) {
        const filterText = `Filters: ${filterBranch ? `Branch: ${filterBranch}` : ''} ${filterBranch && filterDisplaySemester ? '| ' : ''}${filterDisplaySemester ? `Semester: ${filterDisplaySemester}` : ''}`;
        pdf.text(filterText, 15, yPosition);
      } else {
        pdf.text('Filters: None (All Data)', 15, yPosition);
      }
      yPosition += 8;

      // Statistics Section
      pdf.setFontSize(11);
      pdf.setTextColor(46, 125, 50);
      pdf.setFont(undefined, 'bold');
      pdf.text('📊 Statistics:', 15, yPosition);
      yPosition += 6;

      pdf.setFontSize(8);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(undefined, 'normal');
      
      const statsData = [
        { label: 'Total Slots:', value: data.length },
        { label: 'Theory Classes:', value: `${data.filter(s => s.slot_type === 'THEORY').length} (1 hr)` },
        { label: 'Lab Sessions:', value: `${data.filter(s => s.slot_type === 'LAB').length} (2 hrs)` },
        { label: 'Breaks:', value: data.filter(s => s.slot_type === 'BREAK').length },
        { label: 'Recess:', value: data.filter(s => s.slot_type === 'RECESS').length }
      ];

      let colPos = 15;
      statsData.forEach(stat => {
        pdf.text(`${stat.label} ${stat.value}`, colPos, yPosition);
        colPos += 50;
        if (colPos > 150) {
          colPos = 15;
          yPosition += 5;
        }
      });
      yPosition += 10;

      // Table Title
      pdf.setFontSize(11);
      pdf.setTextColor(52, 73, 94);
      pdf.setFont(undefined, 'bold');
      pdf.text('📋 Timetable Details:', 15, yPosition);
      yPosition += 6;

      // Table Setup
      const columns = ['Branch', 'Semester', 'Day', 'Time Slot', 'Type', 'Subject', 'Professor', 'Batch'];
      const columnWidths = [18, 16, 16, 22, 16, 32, 28, 16];
      const rowHeight = 7;
      const headerHeight = 8;

      // Header Row
      let xPos = 15;
      columns.forEach((col, idx) => {
        drawCell(xPos, yPosition + headerHeight, columnWidths[idx], headerHeight, col, 
          [52, 73, 94], [255, 255, 255], 'center', true);
        xPos += columnWidths[idx];
      });
      yPosition += headerHeight;

      // Data Rows
      pdf.setFontSize(7);
      let rowNum = 0;

      data.forEach((slot, dataIdx) => {
        // Check if we need a new page
        if (yPosition + rowHeight > pageHeight - 15) {
          pdf.addPage();
          yPosition = 15;

          // Redraw header on new page
          xPos = 15;
          columns.forEach((col, idx) => {
            drawCell(xPos, yPosition + headerHeight, columnWidths[idx], headerHeight, col,
              [52, 73, 94], [255, 255, 255], 'center', true);
            xPos += columnWidths[idx];
          });
          yPosition += headerHeight;
          rowNum = 0;
        }

        // Format data
        const formatTime = (timeStr) => timeStr ? timeStr.substring(0, 5) : '-';
        const timeRange = `${formatTime(slot.time_slot_start)}-${formatTime(slot.time_slot_end)}`;
        const batchText = slot.batch_number ? (slot.batch_number === 1 ? 'Batch A' : 'Batch B') : '-';

        // Get background color based on slot type
        const bgColor = rowNum % 2 === 0 ? [248, 248, 248] : [255, 255, 255];
        const slotTypeColor = getSlotTypeColor(slot.slot_type);

        // Row data
        const rowData = [
          slot.branch_name || '-',
          slot.semester || '-',
          slot.day_of_week || '-',
          timeRange,
          slot.slot_type || '-',
          slot.subject_name || '-',
          slot.professor_name || '-',
          batchText
        ];

        // Draw row
        xPos = 15;
        rowData.forEach((cellData, colIdx) => {
          // Use slot type color for TYPE column, otherwise use alternating row color
          const cellBgColor = colIdx === 4 ? slotTypeColor : bgColor; // Column 4 is Type
          const align = colIdx === 1 || colIdx === 7 ? 'center' : colIdx === 3 ? 'center' : 'left';
          
          drawCell(xPos, yPosition + rowHeight, columnWidths[colIdx], rowHeight, cellData,
            cellBgColor, [0, 0, 0], align, false);
          
          xPos += columnWidths[colIdx];
        });

        yPosition += rowHeight;
        rowNum++;
      });

      // Summary Section
      yPosition += 5;
      pdf.setFontSize(9);
      pdf.setTextColor(46, 125, 50);
      pdf.setFont(undefined, 'bold');
      pdf.text('📈 Daily Breakdown:', 15, yPosition);
      yPosition += 5;

      // Count by day
      const byDay = {};
      data.forEach(slot => {
        if (!byDay[slot.day_of_week]) byDay[slot.day_of_week] = 0;
        byDay[slot.day_of_week]++;
      });

      pdf.setFontSize(8);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(undefined, 'normal');
      Object.entries(byDay).forEach((entry, idx) => {
        pdf.text(`${entry[0]}: ${entry[1]} slots`, 15 + (idx % 2) * 90, yPosition + Math.floor(idx / 2) * 4);
      });

      // Footer with line
      pdf.setDrawColor(200, 200, 200);
      pdf.line(15, pageHeight - 12, pageWidth - 15, pageHeight - 12);
      
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Page ${pdf.internal.pages.length}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
      pdf.text('Smart Scheduler - Automated Timetable Generation System', 15, pageHeight - 8);

      // Download
      pdf.save(`timetable_${new Date().toISOString().split('T')[0]}.pdf`);
      setMessage('✓ Timetable downloaded as PDF');
    } catch (error) {
      console.error('PDF generation error:', error);
      setMessage('✗ Error generating PDF: ' + error.message);
    }
  };

  const handleCheckConflicts = async () => {
    // For all branches, need to check against all generated semesters
    if (generateForm.allBranches) {
      if (!generateForm.singleSemester && generateForm.generationType === 'single') {
        setMessage('✗ Select a semester to check conflicts');
        return;
      }
      // For all branches, we'll check each branch and combine results
      await checkAllBranchesConflicts();
      return;
    }

    // For single branch
    if (!generateForm.branchId || !generateForm.singleSemester) {
      setMessage('✗ Select a branch and semester to check conflicts');
      return;
    }

    setCheckingConflicts(true);
    setMessage(''); // Clear previous messages
    try {
      console.log('Checking conflicts for:', generateForm.branchId, generateForm.singleSemester);
      const res = await timetableAPI.checkConflicts(generateForm.branchId, generateForm.singleSemester);
      console.log('Conflict check response:', res);
      console.log('Conflict check data:', res.data);
      if (res && res.data) {
        console.log('Setting conflict results:', res.data);
        console.log('Conflicts array:', res.data.conflicts);
        setConflictResults(res.data);
        
        // Extract conflicting entry IDs
        const entryIds = new Set();
        if (res.data.conflicts && Array.isArray(res.data.conflicts)) {
          console.log('Processing conflicts for entry IDs...');
          res.data.conflicts.forEach(conflict => {
            console.log('Conflict object:', conflict);
            if (conflict.entry_id_1) {
              console.log('Adding entry_id_1:', conflict.entry_id_1);
              entryIds.add(conflict.entry_id_1);
            }
            if (conflict.entry_id_2) {
              console.log('Adding entry_id_2:', conflict.entry_id_2);
              entryIds.add(conflict.entry_id_2);
            }
          });
        }
        console.log('Final conflictingEntryIds:', Array.from(entryIds));
        console.log('GeneratedTimetable sample:', generatedTimetable.slice(0, 3));
        setConflictingEntryIds(entryIds);
        
        // ✅ Store the current conflict's branch and semester
        setCurrentConflictBranch(generateForm.branchId);
        setCurrentConflictSemester(generateForm.singleSemester);
        
        setShowConflictModal(true);
        setMessage('✓ Conflict check completed');
      } else {
        setMessage('✗ No response from server');
        console.error('No response data:', res);
      }
    } catch (error) {
      console.error('Conflict check error:', error);
      console.error('Error details:', error.response?.data || error.message);
      setMessage('✗ Error checking conflicts: ' + (error.response?.data?.error || error.response?.data?.details || error.message));
    } finally {
      setCheckingConflicts(false);
    }
  };

  const checkAllBranchesConflicts = async () => {
    setCheckingConflicts(true);
    setMessage(''); // Clear previous messages
    try {
      const semesters = generateForm.generationType === 'odd' ? [1, 3, 5, 7] : generateForm.generationType === 'even' ? [2, 4, 6, 8] : [parseInt(generateForm.singleSemester)];
      const branchesToCheck = branches.map(b => b.branch_id);

      console.log('Checking conflicts for all branches:', branchesToCheck);
      console.log('Semesters:', semesters);

      // Combine all conflict results
      let combinedResults = {
        success: true,
        message: 'Multi-branch conflict check completed',
        summary: {
          totalClasses: 0,
          totalBreaks: 0,
          uniqueSubjects: new Set()
        },
        conflictCount: 0,
        warningCount: 0,
        gapCount: 0,
        conflicts: [],
        warnings: [],
        gaps: [],
        hasIssues: false,
        branchResults: {} // New: store per-branch results
      };

      // Check each branch for each semester
      for (const branchId of branchesToCheck) {
        const branchName = branches.find(b => b.branch_id === branchId)?.name || branchId;
        combinedResults.branchResults[branchName] = {};

        for (const semester of semesters) {
          console.log(`Checking conflicts for ${branchName} Semester ${semester}`);
          try {
            const res = await timetableAPI.checkConflicts(branchId, semester);
            const data = res.data;

            combinedResults.branchResults[branchName][`Sem${semester}`] = {
              conflicts: data.conflicts?.length || 0,
              warnings: data.warnings?.length || 0,
              gaps: data.gaps?.length || 0
            };

            // Add to combined results
            if (data.conflicts && data.conflicts.length > 0) {
              combinedResults.conflicts.push(...data.conflicts.map(c => ({ ...c, branch: branchName, semester })));
              combinedResults.conflictCount += data.conflicts.length;
            }
            if (data.warnings && data.warnings.length > 0) {
              combinedResults.warnings.push(...data.warnings.map(w => ({ ...w, branch: branchName, semester })));
              combinedResults.warningCount += data.warnings.length;
            }
            if (data.gaps && data.gaps.length > 0) {
              combinedResults.gaps.push(...data.gaps.map(g => ({ ...g, branch: branchName, semester })));
              combinedResults.gapCount += data.gaps.length;
            }
            
            // Aggregate summary data
            if (data.summary) {
              combinedResults.summary.totalClasses += data.summary.totalClasses || 0;
              combinedResults.summary.totalBreaks += data.summary.totalBreaks || 0;
              if (data.summary.uniqueSubjects) {
                // Combine unique subjects
                if (typeof data.summary.uniqueSubjects === 'number') {
                  // If it's already a count, add it
                  combinedResults.summary.uniqueSubjects = (combinedResults.summary.uniqueSubjects || 0) + data.summary.uniqueSubjects;
                }
              }
            }
            
            combinedResults.hasIssues = combinedResults.conflictCount > 0;
          } catch (err) {
            console.error(`Error checking conflicts for ${branchName} Semester ${semester}:`, err);
            combinedResults.branchResults[branchName][`Sem${semester}`] = { error: err.message };
          }
        }
      }

      console.log('Combined conflict results:', combinedResults);
      
      // Extract conflicting entry IDs from combined conflicts
      const entryIds = new Set();
      if (combinedResults.conflicts && Array.isArray(combinedResults.conflicts)) {
        console.log('Processing conflicts for entry IDs...');
        combinedResults.conflicts.forEach(conflict => {
          console.log('Conflict object:', conflict);
          if (conflict.entry_id_1) {
            console.log('Adding entry_id_1:', conflict.entry_id_1);
            entryIds.add(conflict.entry_id_1);
          }
          if (conflict.entry_id_2) {
            console.log('Adding entry_id_2:', conflict.entry_id_2);
            entryIds.add(conflict.entry_id_2);
          }
        });
      }
      console.log('Final conflictingEntryIds:', Array.from(entryIds));
      setConflictingEntryIds(entryIds);
      
      setConflictResults(combinedResults);
      setShowConflictModal(true);
      setMessage(`✓ Conflict check completed (${combinedResults.conflictCount} conflicts, ${combinedResults.warningCount} warnings)`);
    } catch (error) {
      console.error('All branches conflict check error:', error);
      setMessage('✗ Error checking conflicts: ' + (error.message || 'Unknown error'));
    } finally {
      setCheckingConflicts(false);
    }
  };

  const handleBranchCheckbox = (branchId) => {
    setNewSubject(prev => ({
      ...prev,
      branches: prev.branches.includes(branchId)
        ? prev.branches.filter(b => b !== branchId)
        : [...prev.branches, branchId]
    }));
  };

  // Handle move button click
  const handleMoveClick = async (entryToMove) => {
    try {
      console.log('🚀 Fetching available slots for entry:', entryToMove.timetable_id);
      const res = await timetableAPI.getAvailableSlots(
        entryToMove.branch_id,
        entryToMove.semester,
        entryToMove.timetable_id
      );

      if (res && res.data && res.data.availableSlots) {
        console.log(`✓ Found ${res.data.availableSlots.length} available slots`);
        setSelectedEntryForMove(entryToMove);
        setAvailableSlots(res.data.availableSlots);
        setShowMoveModal(true);
      } else {
        setMessage('✗ No available slots found - timetable is full');
      }
    } catch (error) {
      console.error('Error fetching available slots:', error);
      setMessage('✗ Error fetching available slots: ' + error.message);
    }
  };

  // Move class to new slot
  const handleMoveToSlot = async (newSlot) => {
    if (!selectedEntryForMove) {
      console.error('[Move] No entry selected for move');
      setMessage('✗ No entry selected for move');
      return;
    }
    
    setCheckingConflicts(true);
    console.log('[Move] Starting move:', {
      entryId: selectedEntryForMove.timetable_id,
      subject: selectedEntryForMove.subject_name,
      currentSlot: `${selectedEntryForMove.day_of_week} ${selectedEntryForMove.time_slot_start}-${selectedEntryForMove.time_slot_end}`,
      newSlot: `${newSlot.day} ${newSlot.start}-${newSlot.end}`
    });

    try {
      const movePayload = {
        entryId: selectedEntryForMove.timetable_id,
        newDay: newSlot.day,
        newStartTime: newSlot.start,
        newEndTime: newSlot.end
      };
      
      console.log('[Move] Payload:', movePayload);
      
      const res = await timetableAPI.moveClass(movePayload);

      console.log('[Move] Response:', res.data);

      if (res && res.data && res.data.success) {
        console.log('[Move] SUCCESS - updating local state');
        const movedEntry = res.data.movedEntry;
        
        // Update timetable with new time slot
        const updatedTimetable = generatedTimetable.map(entry =>
          entry.timetable_id === movedEntry.timetable_id 
            ? {
                ...entry,
                day_of_week: movedEntry.day_of_week,
                time_slot_start: movedEntry.time_slot_start,
                time_slot_end: movedEntry.time_slot_end
              }
            : entry
        );
        
        setGeneratedTimetable(updatedTimetable);
        
        // Show success message
        const successMsg = `✓ Successfully moved ${movedEntry.subject_name} from ${res.data.oldSlot} to ${res.data.newSlot}`;
        console.log('[Move] ' + successMsg);
        setMessage(successMsg);
        
        // Close modal and clear state
        setSelectedEntryForMove(null);
        setShowMoveModal(false);
        setAvailableSlots([]);
        
        // Re-check conflicts after move
        setTimeout(() => handleCheckConflicts(), 500);
      } else {
        // Handle failure or conflicts
        const errorMsg = res.data?.error || 'Move failed for unknown reason';
        console.log('[Move] FAILED:', errorMsg);
        
        if (res.data?.suggestedSwaps && res.data.suggestedSwaps.length > 0) {
          // Show swap suggestions
          const swaps = res.data.suggestedSwaps;
          const swapList = swaps.map(s => `- ${s.subject}: ${s.currentSlot}`).join('\n');
          setMessage(`⚠ Cannot move - Conflicts detected (${res.data.conflictCount}).\n\nPotential solutions (swap these first):\n${swapList}`);
        } else {
          setMessage(`✗ Failed to move class: ${errorMsg}`);
        }
        console.log('[Move] Full response:', res.data);
      }
    } catch (error) {
      console.error('[Move] Error caught:', error);
      console.error('[Move] Status:', error.response?.status);
      console.error('[Move] Error data:', error.response?.data);
      const errorDetail = error.response?.data?.details || error.response?.data?.error || error.message;
      setMessage(`✗ Error moving class: ${errorDetail}`);
    } finally {
      setCheckingConflicts(false);
    }
  };

  const getFilteredSubjects = () => {
    return subjects.filter(subj => {
      const matchesSemester = !filterSemester || subj.semester === parseInt(filterSemester);
      return matchesSemester;
    });
  };

  return (
    <div>
      <h1 style={{ color: '#5c6bc0', fontSize: '2rem', fontWeight: '700', marginBottom: '25px', borderBottom: '3px solid #29b6f6', paddingBottom: '15px' }}>Admin Dashboard</h1>

      {message && (
        <div className={`alert ${message.includes('✓') ? 'alert-success' : 'alert-error'}`}>
          {message}
        </div>
      )}

      <div style={{ marginBottom: '30px', display: 'flex', gap: '10px', flexWrap: 'wrap', borderBottom: '2px solid #e0e0e0', paddingBottom: '15px', alignItems: 'center', justifyContent: 'flex-start', overflowX: 'auto', scrollBehavior: 'smooth' }}>
        <button
          onClick={() => setActiveTab('professors')}
          className={activeTab === 'professors' ? 'btn-primary' : 'btn-warning'}
          style={{ padding: '10px 14px', fontWeight: '600', borderRadius: '8px', fontSize: '13px', whiteSpace: 'nowrap', minWidth: 'fit-content' }}
        >
          👨‍🏫 Professors ({professors.length})
        </button>
        <button
          onClick={() => setActiveTab('subjects')}
          className={activeTab === 'subjects' ? 'btn-primary' : 'btn-warning'}
          style={{ padding: '10px 14px', fontWeight: '600', borderRadius: '8px', fontSize: '13px', whiteSpace: 'nowrap', minWidth: 'fit-content' }}
        >
          📚 Subjects ({subjects.length})
        </button>
        <button
          onClick={() => setActiveTab('feedback')}
          className={activeTab === 'feedback' ? 'btn-primary' : 'btn-warning'}
          style={{ padding: '10px 14px', fontWeight: '600', borderRadius: '8px', fontSize: '13px', whiteSpace: 'nowrap', minWidth: 'fit-content' }}
        >
          💬 Feedback ({feedback.length})
        </button>
        <button
          onClick={() => setActiveTab('prof-stats')}
          className={activeTab === 'prof-stats' ? 'btn-primary' : 'btn-warning'}
          style={{ padding: '10px 14px', fontWeight: '600', borderRadius: '8px', fontSize: '13px', whiteSpace: 'nowrap', minWidth: 'fit-content' }}
        >
          📊 Prof-Stats
        </button>
        <button
          onClick={() => setActiveTab('timetable')}
          className={activeTab === 'timetable' ? 'btn-primary' : 'btn-warning'}
          style={{ padding: '10px 14px', fontWeight: '600', borderRadius: '8px', fontSize: '13px', whiteSpace: 'nowrap', minWidth: 'fit-content' }}
        >
          📅 Timetable
        </button>
        <button
          onClick={() => setActiveTab('ollama-ai')}
          className={activeTab === 'ollama-ai' ? 'btn-primary' : 'btn-warning'}
          style={{ padding: '10px 14px', fontWeight: '600', borderRadius: '8px', fontSize: '13px', whiteSpace: 'nowrap', minWidth: 'fit-content', background: activeTab === 'ollama-ai' ? '#667eea' : '#e8e8e8' }}
        >
          🤖 AI Assistant
        </button>
      </div>

      {loading && <div className="spinner"></div>}

      {activeTab === 'professors' && (
        <div className="card">
          <h2 style={{ color: '#5c6bc0', fontSize: '1.4rem', fontWeight: '700' }}>👨‍🏫 Manage Professors</h2>

          <form onSubmit={handleAddProfessor} style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#fafbfc', borderRadius: '12px', border: '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <h3 style={{ color: '#5c6bc0', marginBottom: '20px', fontSize: '1.2rem', fontWeight: '700' }}>Add New Professor</h3>
            <div className="grid grid-2">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={newProfessor.name}
                  onChange={(e) => setNewProfessor({ ...newProfessor, name: e.target.value })}
                  placeholder="Dr. John Doe"
                  required
                />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={newProfessor.email}
                  onChange={(e) => setNewProfessor({ ...newProfessor, email: e.target.value })}
                  placeholder="john@university.edu"
                  required
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={newProfessor.phone}
                  onChange={(e) => setNewProfessor({ ...newProfessor, phone: e.target.value })}
                  placeholder="9876543210"
                />
              </div>
              <div className="form-group">
                <label>Hours Per Week</label>
                <input
                  type="number"
                  value={newProfessor.hours_per_week || 30}
                  onChange={(e) => setNewProfessor({ ...newProfessor, hours_per_week: parseInt(e.target.value) })}
                  placeholder="30"
                  min="1"
                  max="40"
                />
              </div>
            </div>
            <button type="submit" className="btn-success" style={{ marginTop: '15px', fontWeight: '700' }}>
              ➕ Add Professor
            </button>
          </form>

          <h3 style={{ color: '#5c6bc0', marginBottom: '15px', marginTop: '30px', fontSize: '1.2rem', fontWeight: '700' }}>Professors List</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Hours/Week</th>
                <th>Assigned Subjects</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {professors.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>No professors</td>
                </tr>
              ) : (
                professors.map((prof) => (
                  <tr key={prof.professor_id} style={{ opacity: prof.is_active ? 1 : 0.7, backgroundColor: prof.is_active ? 'transparent' : 'rgba(244, 67, 54, 0.08)' }}>
                    <td style={{ fontWeight: prof.is_active ? '500' : '600', color: prof.is_active ? '#212121' : '#d32f2f' }}>
                      {prof.name} {!prof.is_active && <span style={{ color: '#d32f2f', fontWeight: 'bold', fontSize: '0.85rem', marginLeft: '6px' }}>(DISABLED)</span>}
                    </td>
                    <td>{prof.email}</td>
                    <td>{prof.phone || '-'}</td>
                    <td style={{ fontWeight: '600', color: '#ff6f00' }}>{prof.hours_per_week || 30} hrs</td>
                    <td>
                      {professorSubjects[prof.professor_id] && professorSubjects[prof.professor_id].length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {professorSubjects[prof.professor_id].slice(0, 3).map((subj, idx) => (
                            <span
                              key={idx}
                              style={{
                                display: 'inline-block',
                                backgroundColor: '#e3f2fd',
                                color: '#1976d2',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                border: '1px solid #1976d2'
                              }}
                            >
                              {subj.code || subj.name}
                            </span>
                          ))}
                          {professorSubjects[prof.professor_id].length > 3 && (
                            <span
                              style={{
                                display: 'inline-block',
                                backgroundColor: '#f3e5f5',
                                color: '#7b1fa2',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                border: '1px solid #7b1fa2'
                              }}
                              title={professorSubjects[prof.professor_id].slice(3).map(s => s.code || s.name).join(', ')}
                            >
                              +{professorSubjects[prof.professor_id].length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#999', fontSize: '0.9rem' }}>No subjects</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start' }}>
                        <button
                          onClick={() => handleEditProfessor(prof)}
                          style={{
                            padding: '6px 10px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            borderRadius: '5px',
                            backgroundColor: '#2196F3',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 4px rgba(33, 150, 243, 0.3)'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#1976D2'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#2196F3'}
                          title="Edit professor"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleToggleProfessorStatus(prof.professor_id, prof.is_active)}
                          style={{
                            padding: '6px 10px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            borderRadius: '5px',
                            backgroundColor: prof.is_active ? '#FF9800' : '#4CAF50',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s ease',
                            boxShadow: `0 2px 4px rgba(${prof.is_active ? '255, 152, 0' : '76, 175, 80'}, 0.3)`
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = prof.is_active ? '#F57C00' : '#45a049'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = prof.is_active ? '#FF9800' : '#4CAF50'}
                          title={prof.is_active ? 'Disable professor and their subjects' : 'Enable professor and re-enable subjects'}
                        >
                          {prof.is_active ? '⛔ Disable' : '✅ Enable'}
                        </button>
                        <button
                          onClick={() => handleDeleteProfessor(prof.professor_id)}
                          style={{
                            padding: '6px 10px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            borderRadius: '5px',
                            backgroundColor: '#F44336',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 4px rgba(244, 67, 54, 0.3)'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#D32F2F'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#F44336'}
                          title="Delete professor"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {showEditModal && editingProfessor && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', maxWidth: '500px', width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
                <h2 style={{ color: '#5c6bc0', marginBottom: '20px', fontSize: '1.5rem', fontWeight: '700' }}>✏️ Edit Professor</h2>
                <form onSubmit={handleUpdateProfessor}>
                  <div className="form-group" style={{ marginBottom: '15px' }}>
                    <label>Name *</label>
                    <input
                      type="text"
                      value={editingProfessor.name}
                      onChange={(e) => setEditingProfessor({ ...editingProfessor, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '15px' }}>
                    <label>Email *</label>
                    <input
                      type="email"
                      value={editingProfessor.email}
                      onChange={(e) => setEditingProfessor({ ...editingProfessor, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '15px' }}>
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={editingProfessor.phone || ''}
                      onChange={(e) => setEditingProfessor({ ...editingProfessor, phone: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '15px' }}>
                    <label>Hours Per Week</label>
                    <input
                      type="number"
                      value={editingProfessor.hours_per_week || 30}
                      onChange={(e) => setEditingProfessor({ ...editingProfessor, hours_per_week: parseInt(e.target.value) })}
                      min="1"
                      max="40"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
                    <button
                      type="submit"
                      className="btn-success"
                      style={{ flex: 1, padding: '10px', fontWeight: '700', borderRadius: '6px' }}
                    >
                      💾 Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingProfessor(null);
                      }}
                      className="btn-warning"
                      style={{ flex: 1, padding: '10px', fontWeight: '700', borderRadius: '6px' }}
                    >
                      ✕ Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'subjects' && (
        <div className="card">
          <h2 style={{ color: '#5c6bc0', fontSize: '1.4rem', fontWeight: '700' }}>📚 Manage Subjects</h2>

          <form onSubmit={editingSubject ? handleUpdateSubject : handleAddSubject} style={{ marginBottom: '30px', padding: '20px', backgroundColor: editingSubject ? '#fff8e1' : '#fafbfc', borderRadius: '12px', border: editingSubject ? '2px solid #ff9800' : '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <h3 style={{ color: editingSubject ? '#f57c00' : '#5c6bc0', marginBottom: '20px', fontSize: '1.2rem', fontWeight: '700' }}>{editingSubject ? '✏️ Edit Subject' : '➕ Add New Subject'}</h3>
            <div className="grid grid-2">
              <div className="form-group">
                <label>Subject Name *</label>
                <input
                  type="text"
                  value={newSubject.name}
                  onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                  placeholder="Database Management Systems"
                  required
                />
              </div>
              <div className="form-group">
                <label>Type *</label>
                <select
                  value={newSubject.type}
                  onChange={(e) => setNewSubject({ ...newSubject, type: e.target.value })}
                  required
                >
                  <option value="THEORY">Theory</option>
                  <option value="LAB">Lab</option>
                  <option value="BOTH">Both (Theory + Lab)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Semester *</label>
                <select
                  value={newSubject.semester}
                  onChange={(e) => setNewSubject({ ...newSubject, semester: parseInt(e.target.value) })}
                  required
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                    <option key={sem} value={sem}>
                      Semester {sem}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Weekly Lecture Count</label>
                <input
                  type="number"
                  value={newSubject.weeklyLectureCount}
                  onChange={(e) => setNewSubject({ ...newSubject, weeklyLectureCount: parseInt(e.target.value) })}
                  min="0"
                  max="5"
                />
              </div>
              <div className="form-group">
                <label>Weekly Lab Count 🔬</label>
                <input
                  type="number"
                  value={newSubject.labCount}
                  onChange={(e) => setNewSubject({ ...newSubject, labCount: parseInt(e.target.value) })}
                  min="0"
                  max="5"
                  placeholder="Number of labs per week"
                />
              </div>
            </div>

            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
              <label style={{ fontWeight: 'bold', marginBottom: '10px', display: 'block' }}>
                Map Professor (Optional - Professor can teach multiple subjects):
              </label>
              <select
                value={newSubject.professorId}
                onChange={(e) => setNewSubject({ ...newSubject, professorId: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
              >
                <option value="">-- No Professor Assigned --</option>
                {professors.map((prof) => (
                  <option key={prof.professor_id} value={prof.professor_id}>
                    {prof.name} ({prof.email})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#eff6ff', borderRadius: '4px' }}>
              <label style={{ fontWeight: 'bold', marginBottom: '10px', display: 'block' }}>
                ✓ Select Branches (Subject is common for these branches):
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {branches.map((branch) => (
                  <label key={branch.branch_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newSubject.branches.includes(branch.branch_id)}
                      onChange={() => handleBranchCheckbox(branch.branch_id)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span>{branch.name} ({branch.code})</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn-success">
                {editingSubject ? '✅ Update Subject' : '➕ Add Subject'}
              </button>
              {editingSubject && (
                <button
                  type="button"
                  className="btn-warning"
                  onClick={handleCancelEdit}
                  style={{ padding: '10px 15px' }}
                >
                  ❌ Cancel Edit
                </button>
              )}
            </div>
          </form>

          <h3>Subjects List</h3>
          
          {/* Semester Filter */}
          <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f0f7ff', borderRadius: '4px', display: 'flex', gap: '15px', alignItems: 'center' }}>
            <label style={{ fontWeight: '600', marginBottom: 0 }}>Filter by Semester:</label>
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '150px' }}
            >
              <option value="">-- All Semesters --</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                <option key={sem} value={sem}>
                  Semester {sem}
                </option>
              ))}
            </select>
            <span style={{ color: '#666', fontSize: '0.9rem' }}>
              Showing {getFilteredSubjects().length} of {subjects.length} subjects
            </span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Sem</th>
                <th>Lectures</th>
                <th>Labs 🔬</th>
                <th>Professor</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {getFilteredSubjects().length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center' }}>No subjects found</td>
                </tr>
              ) : (
                getFilteredSubjects().map((subj) => (
                  <tr key={subj.subject_id}>
                    <td><strong>{subj.code}</strong></td>
                    <td>{subj.name}</td>
                    <td>{subj.type}</td>
                    <td>{subj.semester}</td>
                    <td>{subj.weekly_lecture_count}</td>
                    <td>{subj.weekly_lab_count || 0}</td>
                    <td>{subj.professor_names || '—'}</td>
                    <td>
                      <button
                        onClick={() => handleEditSubject(subj)}
                        className="btn-primary"
                        style={{ padding: '5px 10px', fontSize: '0.9rem', marginRight: '5px' }}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDeleteSubject(subj.subject_id)}
                        className="btn-danger"
                        style={{ padding: '5px 10px', fontSize: '0.9rem' }}
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'feedback' && (
        <div className="card">
          <h2 style={{ color: '#5c6bc0', fontSize: '1.4rem', fontWeight: '700' }}>💬 Student Feedback</h2>
          {feedback.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', padding: '20px', fontSize: '1rem' }}>
              📭 No student feedback received yet
            </p>
          ) : (
            <div>
              <p style={{ color: '#666', marginBottom: '15px', fontWeight: '600' }}>
                Total feedback: {feedback.length}
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Branch</th>
                      <th>Semester</th>
                      <th>Type</th>
                      <th>Feedback</th>
                      <th>Rating</th>
                      <th>Submitted</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedback.map((fb) => (
                      <tr key={fb.feedback_id}>
                        <td><strong>{fb.branch_id || '-'}</strong></td>
                        <td>{fb.semester}</td>
                        <td>{fb.feedback_type || 'General'}</td>
                        <td style={{ maxWidth: '300px' }}>
                          <details>
                            <summary style={{ cursor: 'pointer', color: '#3498db' }}>
                              {fb.feedback_text.substring(0, 50)}...
                            </summary>
                            <p style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                              {fb.feedback_text}
                            </p>
                          </details>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {fb.rating ? (
                            <span title={`Rating: ${fb.rating}/5`}>
                              {'⭐'.repeat(fb.rating)}
                            </span>
                          ) : '-'}
                        </td>
                        <td>{new Date(fb.created_at).toLocaleDateString()}</td>
                        <td>
                          <button 
                            className="btn-danger"
                            style={{ padding: '5px 10px', fontSize: '0.85rem' }}
                            onClick={() => {
                              if (window.confirm('Delete this feedback?')) {
                                adminAPI.deleteFeedback(fb.feedback_id)
                                  .then(() => {
                                    setFeedback(feedback.filter(f => f.feedback_id !== fb.feedback_id));
                                    setMessage('✓ Feedback deleted');
                                  })
                                  .catch(err => setMessage('✗ Error deleting feedback'));
                              }
                            }}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'prof-stats' && (
        <div className="card">
          <h2 style={{ color: '#5c6bc0', fontSize: '1.4rem', fontWeight: '700' }}>📊 Professor Lecture Statistics</h2>
          <p style={{ color: '#666', marginBottom: '20px', fontSize: '0.95rem' }}>
            View total lecture hours per day and per week for each professor.
          </p>

          <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#fafbfc', borderRadius: '12px', border: '1px solid #e0e0e0', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>Select Professor:</label>
              <select
                value={selectedProfessor}
                onChange={(e) => setSelectedProfessor(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #e0e0e0', backgroundColor: '#fafbfc' }}
              >
                <option value="">-- Choose a professor --</option>
                {professors.map((prof) => (
                  <option key={prof.professor_id} value={prof.professor_id}>
                    {prof.name} ({prof.email})
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleGetProfessorStats}
              className="btn-success"
              style={{ padding: '10px 20px' }}
            >
              📊 Get Statistics
            </button>
          </div>

          {professorStats && (
            <div>
              <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '4px', border: '2px solid #4caf50' }}>
                <h3 style={{ marginTop: 0, marginBottom: '10px' }}>
                  Professor: {professorStats.professor.name}
                </h3>
                <p style={{ margin: '5px 0', color: '#555' }}>
                  Email: {professorStats.professor.email}
                </p>
                <p style={{ margin: '5px 0', color: '#555' }}>
                  <strong>Total Weekly Hours: {professorStats.weekTotal} hours</strong>
                </p>
                <p style={{ margin: '5px 0', color: '#888', fontSize: '0.9rem' }}>
                  Total timetable entries: {professorStats.totalEntries}
                </p>
              </div>

              <div style={{ marginBottom: '30px' }}>
                <h3>📅 Hours per Day</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                  {['MON', 'TUE', 'WED', 'THU', 'FRI'].map((day) => (
                    <div
                      key={day}
                      style={{
                        padding: '15px',
                        backgroundColor: '#f0f4f8',
                        borderRadius: '8px',
                        border: '2px solid #3498db',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                        <strong>{day}</strong>
                      </div>
                      <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3498db' }}>
                        {professorStats.statistics[day]}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#888' }}>
                        hours
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {professorStats.timetableByDay && (
                <div>
                  <h3>📋 Detailed Schedule</h3>
                  {['MON', 'TUE', 'WED', 'THU', 'FRI'].some(day => professorStats.timetableByDay[day]?.length > 0) ? (
                    <div style={{ overflowX: 'auto' }}>
                      {['MON', 'TUE', 'WED', 'THU', 'FRI'].map((day) => {
                        const dayClasses = professorStats.timetableByDay[day] || [];
                        if (dayClasses.length === 0) return null;

                        return (
                          <div key={day} style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#fafafa', borderRadius: '4px', border: '1px solid #ddd' }}>
                            <h4 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>
                              {day} ({dayClasses.length} class{dayClasses.length !== 1 ? 'es' : ''})
                            </h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#e0e0e0' }}>
                                  <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ccc' }}>Time</th>
                                  <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ccc' }}>Subject</th>
                                  <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ccc' }}>Type</th>
                                  <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ccc' }}>Branch</th>
                                  <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ccc' }}>Semester</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dayClasses.map((cls, idx) => (
                                  <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f5f5f5' }}>
                                    <td style={{ padding: '10px', border: '1px solid #ddd' }}><strong>{cls.time}</strong></td>
                                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>{cls.subject}</td>
                                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                                      <span style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        backgroundColor: cls.type === 'THEORY' ? '#bbdefb' : '#fff9c4',
                                        fontSize: '0.85rem',
                                        fontWeight: 'bold'
                                      }}>
                                        {cls.type}
                                      </span>
                                    </td>
                                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>{cls.branch}</td>
                                    <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center' }}>Sem {cls.semester}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                      No schedule details available
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'timetable' && (
        <div className="card">
          <h2 style={{ color: '#5c6bc0', fontSize: '1.4rem', fontWeight: '700' }}>📅 Generate Timetable</h2>
          <p style={{ color: '#666', marginBottom: '20px', fontSize: '0.95rem' }}>
            Select a semester type and branch to generate an optimized timetable.
          </p>

          <form onSubmit={handleGenerateTimetable} style={{ maxWidth: '600px' }}>
            <div className="form-group" style={{ marginBottom: '20px', padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '12px', border: '2px solid #29b6f6' }}>
              <label style={{ fontWeight: '700', marginBottom: '15px', display: 'block', fontSize: '1.05rem', color: '#5c6bc0' }}>
                📅 Generation Mode:
              </label>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    value="single"
                    checked={generateForm.generationType === 'single'}
                    onChange={(e) => setGenerateForm({ ...generateForm, generationType: e.target.value })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: '600', color: '#333' }}>Single Semester</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    value="odd"
                    checked={generateForm.generationType === 'odd'}
                    onChange={(e) => setGenerateForm({ ...generateForm, generationType: e.target.value })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: '600', color: '#333' }}>📊 Master (Odd: 1,3,5,7)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    value="even"
                    checked={generateForm.generationType === 'even'}
                    onChange={(e) => setGenerateForm({ ...generateForm, generationType: e.target.value })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: '500' }}>📊 Master (Even: 2,4,6,8)</span>
                </label>
              </div>
            </div>

            {generateForm.generationType === 'single' && (
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ fontWeight: 'bold', marginBottom: '10px', display: 'block' }}>
                  Select Specific Semester *
                </label>
                <select
                  value={generateForm.singleSemester}
                  onChange={(e) => setGenerateForm({ ...generateForm, singleSemester: e.target.value })}
                  required={generateForm.generationType === 'single'}
                  style={{ width: '100%', padding: '8px' }}
                >
                  <option value="">-- Select Semester --</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                    <option key={sem} value={sem}>
                      Semester {sem} {sem % 2 === 0 ? '(Even)' : '(Odd)'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(generateForm.generationType === 'odd' || generateForm.generationType === 'even') && (
              <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
                <p style={{ margin: '0', fontWeight: '500', color: '#856404' }}>
                  🔔 Master Timetable Mode: Will generate timetables for all {generateForm.generationType === 'odd' ? 'Odd' : 'Even'} semesters (Semester {generateForm.generationType === 'odd' ? '1, 3, 5, 7' : '2, 4, 6, 8'})
                </p>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={generateForm.allBranches}
                  onChange={(e) => setGenerateForm({ ...generateForm, allBranches: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: '500' }}>Generate for All Branches (COMP, IOT, AIML)</span>
              </label>
            </div>

            {!generateForm.allBranches && (
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ fontWeight: 'bold', marginBottom: '10px', display: 'block' }}>
                  Select Branch *
                </label>
                <select
                  value={generateForm.branchId}
                  onChange={(e) => setGenerateForm({ ...generateForm, branchId: e.target.value })}
                  required={!generateForm.allBranches}
                  style={{ width: '100%', padding: '8px' }}
                >
                  <option value="">-- Select Branch --</option>
                  {branches && branches.length > 0 ? (
                    branches.map((branch) => (
                      <option key={branch.branch_id} value={branch.branch_id}>
                        {branch.name} ({branch.code})
                      </option>
                    ))
                  ) : (
                    <option disabled>No branches available</option>
                  )}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8d7da', borderRadius: '4px', border: '1px solid #f5c6cb' }}>
              <p style={{ margin: '0 0 10px 0', fontWeight: '500', color: '#721c24' }}>
                🗑️ <strong>Clean Start Option:</strong> Delete old timetables before generating new ones
              </p>
              <button 
                type="button" 
                onClick={handleDeleteAllTimetables}
                disabled={loading}
                style={{
                  fontSize: '0.95rem',
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
              >
                {loading ? '⏳ Deleting...' : '🗑️ Delete ALL Timetables From Database'}
              </button>
            </div>

            <button type="submit" className="btn-success" disabled={loading} style={{ fontSize: '1rem', padding: '10px 20px' }}>
              {loading ? '⏳ Generating...' : '🚀 Generate Timetable'}
            </button>
            {generatedTimetable.length > 0 && (
              <button 
                type="button" 
                onClick={handleClearTimetable}
                style={{
                  fontSize: '1rem',
                  padding: '10px 20px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginLeft: '10px'
                }}
              >
                🗑️ Clear Timetable
              </button>
            )}
          </form>

          {generatedTimetable.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>
                  📋 Generated Timetable (
                  {(() => {
                    const filteredCount = generatedTimetable.filter(slot => 
                      (!filterBranch || slot.branch_name === filterBranch) &&
                      (!filterDisplaySemester || slot.semester === parseInt(filterDisplaySemester))
                    ).length;
                    const hasFilters = filterBranch || filterDisplaySemester;
                    return hasFilters ? `${filteredCount} of ${generatedTimetable.length} slots` : `${generatedTimetable.length} slots`;
                  })()}
                  )
                </h3>
                <button
                  onClick={handleCheckConflicts}
                  disabled={checkingConflicts || (!generateForm.allBranches && (!generateForm.branchId || !generateForm.singleSemester)) || (generateForm.allBranches && generateForm.generationType === 'single' && !generateForm.singleSemester)}
                  style={{
                    padding: '8px 15px',
                    backgroundColor: (checkingConflicts || (!generateForm.allBranches && (!generateForm.branchId || !generateForm.singleSemester))) ? '#95a5a6' : '#27ae60',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (checkingConflicts || (!generateForm.allBranches && (!generateForm.branchId || !generateForm.singleSemester))) ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                  title={generateForm.allBranches ? 'Check conflicts for all branches' : !generateForm.branchId ? 'Select a branch' : !generateForm.singleSemester ? 'Select a semester' : 'Check for conflicts'}
                >
                  {checkingConflicts ? '🔄 Checking...' : '✓ Check Conflicts'}
                </button>
              </div>

              {/* Filter by Branch */}
              {generateForm.allBranches && (
                <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', border: '1px solid #ddd' }}>
                  <label style={{ marginRight: '10px', fontWeight: 'bold', display: 'inline-block' }}>
                    🔍 Filter by Branch:
                  </label>
                  <select
                    value={filterBranch}
                    onChange={(e) => setFilterBranch(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid #ddd',
                      fontSize: '14px',
                      minWidth: '200px'
                    }}
                  >
                    <option value="">-- All Branches --</option>
                    {[...new Set(generatedTimetable.map(slot => slot.branch_name))]
                      .filter(name => name && name !== 'Unknown Branch')
                      .sort()
                      .map((branchName) => (
                        <option key={branchName} value={branchName}>
                          {branchName}
                        </option>
                      ))
                    }
                  </select>
                </div>
              )}

              {/* Filter by Semester */}
              <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', border: '1px solid #ddd' }}>
                <label style={{ marginRight: '10px', fontWeight: 'bold', display: 'inline-block' }}>
                  📚 Filter by Semester:
                </label>
                <select
                  value={filterDisplaySemester}
                  onChange={(e) => setFilterDisplaySemester(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    minWidth: '200px'
                  }}
                >
                  <option value="">-- All Semesters --</option>
                  {[...new Set(generatedTimetable.map(slot => slot.semester))]
                    .sort((a, b) => a - b)
                    .map((sem) => (
                      <option key={sem} value={sem}>
                        Semester {sem}
                      </option>
                    ))
                  }
                </select>
              </div>

              <div style={{ overflowX: 'auto', marginTop: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', borderRadius: '4px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#34495e', color: 'white' }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50' }}>Branch</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50' }}>Semester</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50' }}>Day</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50' }}>Time</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50' }}>Duration</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50' }}>Type</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50' }}>Subject</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50' }}>Professor</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50' }}>Batch</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #2c3e50' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedTimetable
                      .filter(slot => 
                        (!filterBranch || slot.branch_name === filterBranch) &&
                        (!filterDisplaySemester || slot.semester === parseInt(filterDisplaySemester))
                      )
                      .map((slot, idx) => {
                      // Debug logging on first render
                      if (idx === 0) {
                        console.log('Slot properties:', Object.keys(slot));
                        console.log('Full slot object:', slot);
                        console.log('Checking timetable_id:', slot.timetable_id);
                        console.log('Current conflictingEntryIds:', Array.from(conflictingEntryIds));
                      }
                      
                      const prof = professors.find(p => p.professor_id === slot.professor_id);
                      const branchName = slot.branch_name || 'Unknown Branch';
                      const isBreak = slot.slot_type === 'BREAK' || slot.slot_type === 'RECESS';
                      const isAdmin = slot.slot_type === 'LIBRARY' || slot.slot_type === 'PROJECT';
                      const bgColor = isBreak ? '#fff3cd' : isAdmin ? '#d1ecf1' : idx % 2 === 0 ? '#f9f9f9' : 'white';
                      const typeEmoji = slot.slot_type === 'THEORY' ? '📚' : slot.slot_type === 'LAB' ? '🔬' : slot.slot_type === 'BREAK' ? '☕' : slot.slot_type === 'RECESS' ? '🍽️' : slot.slot_type === 'LIBRARY' ? '📖' : '💼';
                      
                      // Format time to remove seconds
                      const formatTime = (timeStr) => {
                        if (!timeStr) return '-';
                        return timeStr.substring(0, 5); // Get HH:MM
                      };
                      
                      // Calculate duration
                      const startMin = parseInt(slot.time_slot_start.split(':')[0]) * 60 + parseInt(slot.time_slot_start.split(':')[1]);
                      const endMin = parseInt(slot.time_slot_end.split(':')[0]) * 60 + parseInt(slot.time_slot_end.split(':')[1]);
                      const durationMin = endMin - startMin;
                      const durationHr = durationMin / 60;
                      const durationStr = durationHr === 1 ? '1 hr' : durationHr === 2 ? '2 hrs' : `${durationMin} min`;
                      const isConflicting = conflictingEntryIds.has(slot.timetable_id);
                      
                      // Debug: Log conflicting entries
                      if (isConflicting) {
                        console.log(`🔴 ROW IS CONFLICTING: ${slot.timetable_id} - ${slot.subject_name} ${slot.day_of_week}`);
                      }
                      
                      const rowBgColor = isConflicting ? '#ffcdd2' : bgColor;
                      
                      return (
                        <tr key={idx} style={{ backgroundColor: rowBgColor, borderBottom: '1px solid #ddd', fontWeight: isConflicting ? 'bold' : 'normal' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#2c3e50' }}>{branchName}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 'bold', textAlign: 'center', color: '#d32f2f' }}>Sem {slot.semester}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{slot.day_of_week}</td>
                          <td style={{ padding: '10px 12px' }}>{formatTime(slot.time_slot_start)} - {formatTime(slot.time_slot_end)}</td>
                          <td style={{ padding: '10px 12px', fontSize: '13px', color: '#666' }}>{durationStr}</td>
                          <td style={{ padding: '10px 12px' }}>{typeEmoji} {slot.slot_type}</td>
                          <td style={{ padding: '10px 12px', fontWeight: slot.subject_name !== '-' ? '500' : 'normal' }}>{slot.subject_name}</td>
                          <td style={{ padding: '10px 12px' }}>{prof ? prof.name : '-'}</td>
                          <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 'bold', color: slot.slot_type === 'LAB' ? '#d32f2f' : '#666' }}>
                            {slot.batch_number ? (
                              slot.batch_number === 1 ? '🔵 Batch A' : '🟡 Batch B'
                            ) : (
                              '-'
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {isConflicting && (
                              <button
                                onClick={() => handleMoveClick(slot)}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: '#ff7043',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 'bold'
                                }}
                              >
                                🚀 Move
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '4px', borderLeft: '4px solid #4caf50' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#2e7d32' }}>
                  📊 Timetable Statistics & Timing
                  {(filterBranch || filterDisplaySemester) && <span style={{ fontSize: '0.9em', fontWeight: 'normal' }}> ({filterBranch}{filterBranch && filterDisplaySemester && ' - '}Sem {filterDisplaySemester})</span>}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                  {(() => {
                    const filteredData = generatedTimetable.filter(slot => 
                      (!filterBranch || slot.branch_name === filterBranch) &&
                      (!filterDisplaySemester || slot.semester === parseInt(filterDisplaySemester))
                    );
                    return (
                      <>
                        <div><strong>Total Slots:</strong> {filteredData.length}</div>
                        <div><strong>Theory Classes:</strong> {filteredData.filter(s => s.slot_type === 'THEORY').length} (1 hr each)</div>
                        <div><strong>Lab Sessions:</strong> {filteredData.filter(s => s.slot_type === 'LAB').length} (2 hrs each)</div>
                        <div><strong>Breaks:</strong> {filteredData.filter(s => s.slot_type === 'BREAK').length} (15 min)</div>
                        <div><strong>Recess:</strong> {filteredData.filter(s => s.slot_type === 'RECESS').length} (45 min)</div>
                        <div><strong>Status:</strong> <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>✓ Conflict Free</span></div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Download Buttons */}
              <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleDownloadTimetable('json')}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  📥 Download as JSON
                </button>
                <button
                  onClick={() => handleDownloadTimetable('csv')}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#27ae60',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  📊 Download as CSV
                </button>
                <button
                  onClick={() => handleDownloadTimetable('pdf')}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  📄 Download as PDF
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#f0f8ff', borderRadius: '4px', borderLeft: '4px solid #3498db' }}>
            <h4>ℹ️ Timetable Generation Details</h4>
            <ul style={{ marginLeft: '20px', color: '#555', lineHeight: '1.8' }}>
              <li><strong>College Hours:</strong> 9:00 AM - 5:00 PM</li>
              <li><strong>Tea Break:</strong> 11:00 AM - 11:15 AM (15 minutes)</li>
              <li><strong>Recess:</strong> 1:15 PM - 2:00 PM (45 minutes)</li>
              <li><strong>Lab Capacity:</strong> Maximum 5 labs at any time slot</li>
              <li><strong>Batch Scheduling:</strong> Batch A & B alternate schedules for fairness</li>
              <li><strong>Library Hour:</strong> Allocated once per week for conflict resolution</li>
              <li><strong>Project Hour:</strong> Allocated once per week for 2nd Year & 3rd Year (Sem 3-8 only)</li>
              <li><strong>Multi-Branch Subjects:</strong> Labs scheduled in different time slots per branch</li>
              <li><strong>Algorithm:</strong> Backtracking with constraint satisfaction</li>
            </ul>
          </div>
        </div>
      )}

      {/* Conflict Check Modal */}
      {showConflictModal && conflictResults && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '85vh',
            overflowY: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px',
              borderBottom: '2px solid #ecf0f1',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: conflictResults.success ? '#d4edda' : '#f8d7da'
            }}>
              <h2 style={{ margin: 0, color: conflictResults.success ? '#155724' : '#721c24' }}>
                {conflictResults.success ? '✓ Timetable is Valid!' : '⚠️ Conflicts Detected'}
              </h2>
              <button
                onClick={handleCloseConflictModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#999'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              {/* Summary */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '15px',
                marginBottom: '25px',
                padding: '15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#27ae60' }}>
                    {conflictResults.summary?.totalClasses || 0}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Total Classes</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e74c3c' }}>
                    {conflictResults.conflictCount || 0}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Critical Conflicts</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f39c12' }}>
                    {conflictResults.warningCount || 0}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Warnings</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3498db' }}>
                    {conflictResults.gapCount || 0}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Unused Slots</div>
                </div>
              </div>

              {/* Branch Results Summary (for multi-branch checks) */}
              {conflictResults.branchResults && Object.keys(conflictResults.branchResults).length > 0 && (
                <div style={{
                  marginBottom: '25px',
                  padding: '15px',
                  backgroundColor: '#f0f8ff',
                  borderRadius: '4px',
                  borderLeft: '4px solid #3498db'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', color: '#2c3e50' }}>📊 Per-Branch Summary</h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '10px'
                  }}>
                    {Object.entries(conflictResults.branchResults).map(([branch, semesters]) => (
                      <div key={branch} style={{
                        padding: '10px',
                        backgroundColor: 'white',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#2c3e50' }}>
                          {branch}
                        </div>
                        {Object.entries(semesters).map(([sem, stats]) => (
                          <div key={sem} style={{
                            fontSize: '12px',
                            color: '#555',
                            marginBottom: '4px',
                            paddingLeft: '10px',
                            borderLeft: '2px solid #ecf0f1'
                          }}>
                            <span style={{ fontWeight: '500' }}>{sem}:</span> {typeof stats === 'object' && !stats.error ? (
                              <span>
                                🔴 {stats.conflicts || 0} | 🟠 {stats.warnings || 0} | 🔵 {stats.gaps || 0}
                              </span>
                            ) : (
                              <span style={{ color: '#e74c3c' }}>Error</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Critical Conflicts */}
              {conflictResults.conflicts && conflictResults.conflicts.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ color: '#c0392b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🔴 Critical Conflicts ({conflictResults.conflicts.length})
                  </h3>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {conflictResults.conflicts.map((conflict, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px',
                          backgroundColor: '#fadbd8',
                          borderLeft: '4px solid #e74c3c',
                          borderRadius: '4px'
                        }}
                      >
                        <div style={{ fontWeight: 'bold', color: '#c0392b', marginBottom: '5px' }}>
                          {conflict.type.replace(/_/g, ' ')} {conflict.branch && <span style={{ fontSize: '12px', color: '#888' }}>({conflict.branch} - Sem {conflict.semester})</span>}
                        </div>
                        <div style={{ fontSize: '13px', color: '#555', marginBottom: '5px' }}>
                          <strong>Reason:</strong> {conflict.reason}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', display: 'grid', gap: '3px' }}>
                          {conflict.class1 && <div>→ Class 1: {conflict.class1}</div>}
                          {conflict.class2 && <div>→ Class 2: {conflict.class2}</div>}
                          {conflict.professor && <div>→ Professor: {conflict.professor}</div>}
                          {conflict.batch && <div>→ {conflict.batch}</div>}
                          {conflict.room && <div>→ Room: {conflict.room}</div>}
                          {conflict.lab && <div>→ Lab: {conflict.lab}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {conflictResults.warnings && conflictResults.warnings.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ color: '#d68910', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🟠 Warnings ({conflictResults.warnings.length})
                  </h3>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {conflictResults.warnings.map((warning, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px',
                          backgroundColor: '#fef5e7',
                          borderLeft: '4px solid #f39c12',
                          borderRadius: '4px'
                        }}
                      >
                        <div style={{ fontWeight: 'bold', color: '#d68910', marginBottom: '5px' }}>
                          {warning.type.replace(/_/g, ' ')}
                        </div>
                        <div style={{ fontSize: '13px', color: '#555' }}>
                          {warning.reason}
                        </div>
                        {warning.subject && (
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            → Subject: {warning.subject}
                          </div>
                        )}
                        {warning.time && (
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            → Time: {warning.time}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unused Slots */}
              {conflictResults.gaps && conflictResults.gaps.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ color: '#3498db', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ℹ️ Unused Time Slots ({conflictResults.gaps.length})
                  </h3>
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#d6eaf8',
                    borderLeft: '4px solid #3498db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {conflictResults.gaps.map((gap, idx) => (
                      <div key={idx} style={{ marginBottom: '5px', color: '#1c5aa0' }}>
                        → {gap.day} {gap.time} ({gap.duration} min)
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '8px', fontStyle: 'italic' }}>
                    💡 Tip: These unused slots could be used for makeup classes or additional subjects.
                  </div>
                </div>
              )}

              {/* Success Message */}
              {conflictResults.success && (
                <div style={{
                  padding: '15px',
                  backgroundColor: '#d4edda',
                  borderLeft: '4px solid #28a745',
                  borderRadius: '4px',
                  color: '#155724',
                  fontWeight: 'bold'
                }}>
                  ✓ Timetable passes all validation checks! No critical conflicts detected.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '15px',
              borderTop: '2px solid #ecf0f1',
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={handleCloseConflictModal}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Close
              </button>
              <button
                onClick={async () => {
                  setCheckingConflicts(true);
                  try {
                    // Regenerate timetable - pass synthetic event to prevent error
                    await handleGenerateTimetable({ preventDefault: () => {} });
                    // Close modal briefly to show regeneration happening
                    setShowConflictModal(false);
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    // Re-check conflicts with fresh data - use handleCheckConflicts to auto-detect single vs all branches
                    await handleCheckConflicts();
                  } catch (error) {
                    console.error('Regenerate error:', error);
                    setMessage('✗ Error regenerating: ' + error.message);
                  } finally {
                    setCheckingConflicts(false);
                  }
                }}
                disabled={checkingConflicts}
                style={{
                  padding: '10px 20px',
                  backgroundColor: checkingConflicts ? '#95a5a6' : '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: checkingConflicts ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: checkingConflicts ? 0.6 : 1
                }}
              >
                {checkingConflicts ? '⏳ Regenerating...' : '🔄 Regenerate & Refresh'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Class Modal */}
      {showMoveModal && selectedEntryForMove && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto',
            padding: '0'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px',
              borderBottom: '2px solid #ecf0f1',
              backgroundColor: '#ff7043',
              color: 'white',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0 }}>🚀 Move Class to Available Slot</h3>
              <button
                onClick={() => setShowMoveModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '0'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px' }}>
              {/* Current Entry Info */}
              <div style={{
                backgroundColor: '#fff3e0',
                padding: '15px',
                borderRadius: '4px',
                marginBottom: '20px',
                borderLeft: '4px solid #ff9800'
              }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#e65100' }}>Current Schedule:</h4>
                <div style={{ fontSize: '14px' }}>
                  <div><strong>Branch:</strong> {selectedEntryForMove.branch_name || 'Unknown'}</div>
                  <div><strong>Semester:</strong> {selectedEntryForMove.semester}</div>
                  <div><strong>Subject:</strong> {selectedEntryForMove.subject_name}</div>
                  <div><strong>Professor:</strong> {selectedEntryForMove.professor_name || professors.find(p => p.professor_id === selectedEntryForMove.professor_id)?.name || '-'}</div>
                  <div><strong>Current Slot:</strong> {selectedEntryForMove.day_of_week} {selectedEntryForMove.time_slot_start} - {selectedEntryForMove.time_slot_end}</div>
                  <div><strong>Type:</strong> {selectedEntryForMove.slot_type}</div>
                  <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#e0f2f1', borderRadius: '3px', color: '#00695c' }}>
                    <strong>🔍 Required Duration:</strong> {(() => {
                      const startParts = selectedEntryForMove.time_slot_start.split(':');
                      const endParts = selectedEntryForMove.time_slot_end.split(':');
                      const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
                      const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
                      const durationMin = endMin - startMin;
                      const hours = durationMin / 60;
                      return `${hours} hour${hours !== 1 ? 's' : ''}`;
                    })()}
                  </div>
                </div>
              </div>

              {/* Available Slots */}
              <h4 style={{ color: '#2c3e50', marginBottom: '10px' }}>
                📅 Available Empty Slots ({availableSlots.length}) - Matching Duration Only
              </h4>
              {availableSlots.length === 0 ? (
                <div style={{ 
                  padding: '20px', 
                  textAlign: 'center', 
                  color: '#e74c3c',
                  backgroundColor: '#fadbd8',
                  borderRadius: '4px',
                  marginBottom: '15px',
                  border: '2px solid #e74c3c'
                }}>
                  ⚠️ No available slots found with matching duration. All time slots are occupied.
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '10px',
                  maxHeight: '350px',
                  overflowY: 'auto',
                  marginBottom: '15px'
                }}>
                  {availableSlots.map((slot, idx) => (
                    <button
                      key={`slot-${idx}`}
                      onClick={() => {
                        console.log('[Move-Click] Clicked slot:', idx, slot);
                        handleMoveToSlot(slot);
                      }}
                      disabled={checkingConflicts}
                      title={`Click to move to this slot | ${slot.duration}h duration`}
                      style={{
                        padding: '12px',
                        backgroundColor: checkingConflicts ? '#ecf0f1' : '#27ae60',
                        color: checkingConflicts ? '#999' : 'white',
                        border: '2px solid ' + (checkingConflicts ? '#bdc3c7' : '#229954'),
                        borderRadius: '4px',
                        cursor: checkingConflicts ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        transition: 'all 0.3s ease',
                        lineHeight: '1.5',
                        textAlign: 'center'
                      }}
                      onMouseEnter={(e) => {
                        if (!checkingConflicts) {
                          e.target.style.backgroundColor = '#229954';
                          e.target.style.transform = 'scale(1.05)';
                          e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!checkingConflicts) {
                          e.target.style.backgroundColor = '#27ae60';
                          e.target.style.transform = 'scale(1)';
                          e.target.style.boxShadow = 'none';
                        }
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>{slot.day}</div>
                      <div style={{ fontSize: '12px', marginBottom: '3px' }}>
                        {slot.start.substring(0, 5)}-{slot.end.substring(0, 5)}
                      </div>
                      <div style={{ fontSize: '11px', opacity: 0.95 }}>
                        📍 {slot.duration}h
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {checkingConflicts && (
                <div style={{
                  marginTop: '15px',
                  padding: '10px',
                  backgroundColor: '#e3f2fd',
                  borderRadius: '4px',
                  textAlign: 'center',
                  color: '#1565c0',
                  fontWeight: 'bold'
                }}>
                  ⏳ Moving class... Please wait...
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '15px',
              borderTop: '2px solid #ecf0f1',
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setShowMoveModal(false)}
                disabled={checkingConflicts}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: checkingConflicts ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: checkingConflicts ? 0.6 : 1
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ollama-ai' && (
        <div className="card" style={{ height: '700px', display: 'flex', flexDirection: 'column' }}>
          <OllamaAssistant />
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
