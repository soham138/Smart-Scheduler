import React, { useState, useEffect } from 'react';
import { timetableAPI, professorAPI, adminAPI } from '../services/api';

function ProfessorPanel() {
  const [activeTab, setActiveTab] = useState('timetable');
  const [professorsDropdown, setProfessorsDropdown] = useState([]);
  const [selectedProfessorId, setSelectedProfessorId] = useState('');
  const [timetable, setTimetable] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [subjects, setSubjects] = useState([]);
  
  // Assignment form states
  const [assignmentForm, setAssignmentForm] = useState({
    subjectId: '',
    title: '',
    contentType: 'TEXT',
    content: '',
    fileData: '',
    semester: ''
  });
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    loadProfessors();
  }, []);

  useEffect(() => {
    if (selectedProfessorId && activeTab === 'timetable') {
      fetchTimetable(selectedProfessorId);
      fetchSubjects(selectedProfessorId);
    }
  }, [selectedProfessorId, activeTab]);

  useEffect(() => {
    if (selectedProfessorId && activeTab === 'assignments') {
      fetchSubjects(selectedProfessorId);
      fetchAssignments(selectedProfessorId);
    }
  }, [selectedProfessorId, activeTab]);

  const loadProfessors = async () => {
    try {
      const res = await adminAPI.getAllProfessors();
      setProfessorsDropdown(res.data.data || []);
    } catch (error) {
      console.error('Error loading professors:', error);
    }
  };

  const fetchTimetable = async (profId) => {
    setLoading(true);
    try {
      const res = await timetableAPI.viewProfessorTimetable(profId);
      const data = res.data.data || [];
      console.log('📊 Timetable Data Received:', data);
      console.log('📊 First slot sample:', data[0]);
      setTimetable(data);
      const profName = professorsDropdown.find(p => p.professor_id === profId)?.name || 'Professor';
      setMessage(`✓ Timetable loaded for ${profName}! (${data.length || 0} slots)`);
    } catch (error) {
      if (error.response?.status === 404) {
        setMessage('ℹ️ No timetable assigned yet for this professor.');
      } else {
        setMessage('✗ Error: ' + (error.response?.data?.error || error.message));
      }
      setTimetable([]);
    }
    setLoading(false);
  };

  const fetchSubjects = async (profId) => {
    try {
      const res = await timetableAPI.getProfessorSubjects(profId);
      if (res?.data?.data) {
        setSubjects(res.data.data || []);
      }
    } catch (error) {
      console.log('Error fetching subjects:', error);
      setSubjects([]);
    }
  };

  const fetchAssignments = async (profId) => {
    try {
      const res = await professorAPI.getProfessorAssignments(profId);
      setAssignments(res.data.data || []);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      setAssignments([]);
    }
  };

  const handleAddAssignment = async (e) => {
    e.preventDefault();
    
    if (!assignmentForm.subjectId || !assignmentForm.title || !assignmentForm.content) {
      setMessage('✗ Please fill all required fields');
      return;
    }

    const selectedSubject = subjects.find(s => s.subject_id === assignmentForm.subjectId);
    if (!selectedSubject) {
      setMessage('✗ Invalid subject selected');
      return;
    }

    try {
      let contentData = assignmentForm.content;

      // Handle file uploads for PDF and IMAGE
      if ((assignmentForm.contentType === 'PDF' || assignmentForm.contentType === 'IMAGE') && assignmentForm.fileData) {
        contentData = assignmentForm.fileData;
      }

      const payload = {
        professorId: selectedProfessorId,
        subjectId: assignmentForm.subjectId,
        title: assignmentForm.title,
        contentType: assignmentForm.contentType,
        content: contentData,
        semester: selectedSubject.semester
      };

      await professorAPI.addAssignment(payload);
      setMessage('✓ Assignment added successfully');
      setAssignmentForm({ subjectId: '', title: '', contentType: 'TEXT', content: '', fileData: '', semester: '' });
      fetchAssignments(selectedProfessorId);
    } catch (error) {
      setMessage('✗ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!window.confirm('Are you sure you want to delete this assignment?')) {
      return;
    }

    try {
      await professorAPI.deleteAssignment(assignmentId);
      setMessage('✓ Assignment deleted successfully');
      fetchAssignments(selectedProfessorId);
    } catch (error) {
      setMessage('✗ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type and size
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setMessage('✗ File size exceeds 10MB limit');
      return;
    }

    if (assignmentForm.contentType === 'PDF' && !file.type.includes('pdf')) {
      setMessage('✗ Please select a valid PDF file');
      return;
    }

    if (assignmentForm.contentType === 'IMAGE' && !file.type.startsWith('image/')) {
      setMessage('✗ Please select a valid image file');
      return;
    }

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      setAssignmentForm(prev => ({
        ...prev,
        fileData: event.target.result,
        content: file.name
      }));
      setMessage('✓ File uploaded: ' + file.name);
    };
    reader.onerror = () => {
      setMessage('✗ Error reading file');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <h1>Professor Panel</h1>

      <div style={{ marginBottom: '20px', borderBottom: '2px solid #ddd' }}>
        <button
          onClick={() => setActiveTab('timetable')}
          className={activeTab === 'timetable' ? 'btn-primary' : 'btn-secondary'}
          style={{ marginRight: '10px', marginBottom: '10px' }}
        >
          My Timetable
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={activeTab === 'assignments' ? 'btn-primary' : 'btn-secondary'}
          style={{ marginBottom: '10px' }}
        >
          Assignments
        </button>
      </div>

      {activeTab === 'timetable' && (
        <div className="card">
          <h2>📅 Professor Timetable</h2>
          
          {message && (
            <div className={`alert ${message.includes('✓') || message.includes('ℹ️') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '20px' }}>
              {message}
            </div>
          )}

          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f0f8ff', borderRadius: '4px', border: '2px solid #3498db' }}>
            <label style={{ fontWeight: 'bold', marginBottom: '10px', display: 'block' }}>
              👨‍🏫 Select Professor *
            </label>
            <select
              value={selectedProfessorId}
              onChange={(e) => setSelectedProfessorId(e.target.value)}
              required
              style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
            >
              <option value="">-- Select Professor --</option>
              {professorsDropdown.map((prof) => (
                <option key={prof.professor_id} value={prof.professor_id}>
                  {prof.name} ({prof.email})
                </option>
              ))}
            </select>
            <button 
              className="btn-primary" 
              onClick={() => selectedProfessorId && fetchTimetable(selectedProfessorId)} 
              disabled={loading || !selectedProfessorId}
              style={{ marginTop: '10px' }}
            >
              {loading ? '⏳ Loading...' : '🔄 Load Timetable'}
            </button>
          </div>

          {timetable.length > 0 && (
            <div>
              <h3>📋 Timetable - Master View ({timetable.length} slots)</h3>
              <p style={{ color: '#666', marginBottom: '15px' }}>Timewise schedule for the selected professor across all semesters.</p>
              <div style={{ overflowX: 'auto', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', borderRadius: '4px' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#34495e', color: 'white' }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50', fontWeight: 'bold' }}>Day</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50', fontWeight: 'bold' }}>Time</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50', fontWeight: 'bold' }}>Type</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #2c3e50', fontWeight: 'bold' }}>Subject</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #2c3e50', fontWeight: 'bold' }}>Semester</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #2c3e50', fontWeight: 'bold' }}>Batch</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #2c3e50', fontWeight: 'bold' }}>Branch</th>
                      <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #2c3e50', fontWeight: 'bold' }}>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timetable
                      .sort((a, b) => {
                        // Map day abbreviations to order
                        const dayOrder = { 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6, 'SUN': 7, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
                        const dayCompare = (dayOrder[a.day_of_week] || 0) - (dayOrder[b.day_of_week] || 0);
                        if (dayCompare !== 0) return dayCompare;
                        return a.time_slot_start.localeCompare(b.time_slot_start);
                      })
                      .map((slot, idx) => {
                        // Format day name
                        const formatDay = (dayStr) => {
                          const dayMap = { 'MON': 'Monday', 'TUE': 'Tuesday', 'WED': 'Wednesday', 'THU': 'Thursday', 'FRI': 'Friday', 'SAT': 'Saturday', 'SUN': 'Sunday' };
                          return dayMap[dayStr] || dayStr;
                        };

                        // Format time to remove seconds
                        const formatTime = (timeStr) => {
                          if (!timeStr) return '-';
                          return timeStr.substring(0, 5); // Get HH:MM
                        };

                        // Calculate duration
                        const parseTime = (timeStr) => {
                          const [h, m] = timeStr.split(':').map(Number);
                          return h * 60 + m;
                        };

                        const startMin = parseTime(slot.time_slot_start);
                        const endMin = parseTime(slot.time_slot_end);
                        const durationMin = endMin - startMin;
                        const durationHr = durationMin / 60;
                        const durationStr = durationHr === 1 ? '1 hr' : durationHr === 2 ? '2 hrs' : `${durationMin} min`;

                        // Debug log
                        if (idx < 2) {
                          console.log(`Slot ${idx}:`, {
                            batch_number: slot.batch_number,
                            batch_id: slot.batch_id,
                            branch_name: slot.branch_name,
                            slot_type: slot.slot_type
                          });
                        }

                        // Get batch information - show for LABs
                        const batchText = slot.slot_type === 'LAB' 
                          ? (slot.batch_number 
                              ? (slot.batch_number === 1 ? '🔵 Batch A' : slot.batch_number === 2 ? '🟡 Batch B' : `Batch ${slot.batch_number}`)
                              : '-')
                          : '-';

                        // Get branch information
                        const branchText = slot.branch_name || slot.branch_code || '-';

                        // Get slot type emoji and color
                        const typeEmoji = slot.slot_type === 'THEORY' ? '📚' : slot.slot_type === 'LAB' ? '🔬' : slot.slot_type === 'BREAK' ? '☕' : slot.slot_type === 'RECESS' ? '🍽️' : '💼';
                        
                        // Determine row background color
                        const isLabOrBreak = slot.slot_type === 'LAB' || slot.slot_type === 'BREAK' || slot.slot_type === 'RECESS';
                        const bgColor = isLabOrBreak 
                          ? slot.slot_type === 'LAB' ? '#fff3e0' : slot.slot_type === 'BREAK' ? '#fff9c4' : '#f0f4c3'
                          : idx % 2 === 0 ? '#f9f9f9' : 'white';

                        return (
                          <tr 
                            key={idx} 
                            style={{ 
                              backgroundColor: bgColor, 
                              borderBottom: '1px solid #ddd',
                              fontWeight: slot.slot_type === 'LAB' ? 'bold' : 'normal'
                            }}
                          >
                            <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#2c3e50' }}>
                              {formatDay(slot.day_of_week)}
                            </td>
                            <td style={{ padding: '10px 12px', color: '#d32f2f', fontWeight: '600' }}>
                              {formatTime(slot.time_slot_start)} - {formatTime(slot.time_slot_end)}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {typeEmoji} {slot.slot_type}
                            </td>
                            <td style={{ padding: '10px 12px', maxWidth: '300px' }}>
                              <strong>{slot.subject_name || '-'}</strong>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '600', color: '#d32f2f' }}>
                              Sem {slot.semester || '-'}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '600', color: '#e74c3c' }}>
                              {batchText}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '600', color: '#1565c0', backgroundColor: slot.branch_name || slot.branch_code ? '#e3f2fd' : 'inherit' }}>
                              {branchText}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', color: '#666' }}>
                              {durationStr}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                <div style={{ padding: '12px', backgroundColor: '#f5f5f5', fontSize: '12px', color: '#666', borderRadius: '0 0 4px 4px' }}>
                  📊 Total: {timetable.length} slots | Theory: {timetable.filter(s => s.slot_type === 'THEORY').length} | Labs: {timetable.filter(s => s.slot_type === 'LAB').length} | Others: {timetable.filter(s => ['BREAK', 'RECESS', 'LIBRARY', 'PROJECT'].includes(s.slot_type)).length}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="card">
          <h2>📝 Manage Assignments</h2>

          {message && (
            <div className={`alert ${message.includes('✓') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '20px' }}>
              {message}
            </div>
          )}

          <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
            <label style={{ fontWeight: 'bold', marginBottom: '10px', display: 'block' }}>
              👨‍🏫 Select Professor *
            </label>
            <select
              value={selectedProfessorId}
              onChange={(e) => setSelectedProfessorId(e.target.value)}
              required
              style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
            >
              <option value="">-- Select Professor --</option>
              {professorsDropdown.map((prof) => (
                <option key={prof.professor_id} value={prof.professor_id}>
                  {prof.name} ({prof.email})
                </option>
              ))}
            </select>
          </div>

          {selectedProfessorId && (
            <form onSubmit={handleAddAssignment} style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
              <h3>Add New Assignment</h3>
              
              <div className="grid grid-2">
                <div className="form-group">
                  <label>Subject *</label>
                  <select
                    value={assignmentForm.subjectId}
                    onChange={(e) => {
                      setAssignmentForm({ ...assignmentForm, subjectId: e.target.value });
                      const subj = subjects.find(s => s.subject_id === e.target.value);
                      if (subj) {
                        setAssignmentForm(prev => ({ ...prev, semester: subj.semester }));
                      }
                    }}
                    required
                  >
                    <option value="">-- Select Subject --</option>
                    {subjects.length > 0 ? (
                      subjects.map((subj) => (
                        <option key={subj.subject_id} value={subj.subject_id}>
                          {subj.name} ({subj.code}) - Sem {subj.semester}
                        </option>
                      ))
                    ) : (
                      <option disabled>No subjects assigned</option>
                    )}
                  </select>
                  <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '5px' }}>
                    {subjects.length === 0 && 'No subjects assigned to this professor. Contact admin to assign subjects.'}
                  </p>
                </div>

                <div className="form-group">
                  <label>Assignment Title *</label>
                  <input
                    type="text"
                    value={assignmentForm.title}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })}
                    placeholder="e.g., Chapter 5 Exercise"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Content Type *</label>
                <select
                  value={assignmentForm.contentType}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, contentType: e.target.value, content: '', fileData: '' })}
                  required
                >
                  <option value="TEXT">📝 Text / Description</option>
                  <option value="PDF">📄 PDF File (upload)</option>
                  <option value="LINK">🔗 External Link (website, video, etc.)</option>
                  <option value="IMAGE">🖼️ Image (upload)</option>
                </select>
                <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '5px' }}>
                  {assignmentForm.contentType === 'TEXT' && 'Enter assignment description, instructions, or content directly.'}
                  {assignmentForm.contentType === 'PDF' && 'Upload a PDF file (Max 10MB).'}
                  {assignmentForm.contentType === 'LINK' && 'Paste a link to a website, YouTube video, or resource.'}
                  {assignmentForm.contentType === 'IMAGE' && 'Upload an image file (Max 10MB).'}
                </p>
              </div>

              <div className="form-group">
                <label>
                  {assignmentForm.contentType === 'TEXT' && 'Content / Description *'}
                  {assignmentForm.contentType === 'PDF' && 'PDF File *'}
                  {assignmentForm.contentType === 'LINK' && 'Link / URL *'}
                  {assignmentForm.contentType === 'IMAGE' && 'Image File *'}
                </label>
                {assignmentForm.contentType === 'TEXT' && (
                  <textarea
                    value={assignmentForm.content}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, content: e.target.value })}
                    placeholder="Enter assignment details, instructions, or questions..."
                    rows="6"
                    required
                  ></textarea>
                )}
                {assignmentForm.contentType === 'LINK' && (
                  <input
                    type="url"
                    value={assignmentForm.content}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, content: e.target.value })}
                    placeholder="https://example.com or https://youtube.com/watch?v=..."
                    required
                  />
                )}
                {assignmentForm.contentType === 'PDF' && (
                  <div style={{ marginTop: '10px' }}>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      style={{ display: 'block', marginBottom: '10px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', width: '100%' }}
                    />
                    {assignmentForm.content && (
                      <div style={{ padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '4px', marginTop: '10px' }}>
                        <p style={{ margin: '0', color: '#2e7d32', fontSize: '0.9rem' }}>
                          ✓ File selected: <strong>{assignmentForm.content}</strong>
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {assignmentForm.contentType === 'IMAGE' && (
                  <div style={{ marginTop: '10px' }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      style={{ display: 'block', marginBottom: '10px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', width: '100%' }}
                    />
                    {assignmentForm.content && (
                      <div style={{ padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '4px', marginTop: '10px' }}>
                        <p style={{ margin: '0', color: '#2e7d32', fontSize: '0.9rem' }}>
                          ✓ File selected: <strong>{assignmentForm.content}</strong>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button type="submit" className="btn-success" style={{ width: '100%', padding: '10px' }}>
                ➕ Add Assignment
              </button>
            </form>
          )}

          {selectedProfessorId && (
            <>
              <h3>📋 Your Assignments ({assignments.length})</h3>
              {assignments.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#666' }}>No assignments created yet</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Created</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((assign) => (
                        <tr key={assign.assignment_id}>
                          <td>{assign.subject_name}</td>
                          <td>{assign.title}</td>
                          <td>
                            {assign.content_type === 'TEXT' && '📝 Text'}
                            {assign.content_type === 'PDF' && '📄 PDF'}
                            {assign.content_type === 'LINK' && '🔗 Link'}
                            {assign.content_type === 'IMAGE' && '🖼️ Image'}
                          </td>
                          <td>{new Date(assign.created_at).toLocaleDateString()}</td>
                          <td>
                            <button 
                              className="btn-danger" 
                              style={{ padding: '5px 10px', fontSize: '0.9rem' }}
                              onClick={() => handleDeleteAssignment(assign.assignment_id)}
                            >
                              🗑️ Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ProfessorPanel;
