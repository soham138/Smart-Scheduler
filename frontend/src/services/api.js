import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Admin Services
export const adminAPI = {
  // Professor endpoints
  addProfessor: (data) => api.post('/admin/professors', data),
  getAllProfessors: () => api.get('/admin/professors'),
  getProfessor: (id) => api.get(`/admin/professors/${id}`),
  updateProfessor: (id, data) => api.put(`/admin/professors/${id}`, data),
  toggleProfessorStatus: (id, is_active) => api.patch(`/admin/professors/${id}/status`, { is_active }),
  deleteProfessor: (id) => api.delete(`/admin/professors/${id}`),

  // Subject endpoints
  addSubject: (data) => api.post('/admin/subjects', data),
  getAllSubjects: () => api.get('/admin/subjects'),
  getSubject: (id) => api.get(`/admin/subjects/${id}`),
  updateSubject: (id, data) => api.put(`/admin/subjects/${id}`, data),
  deleteSubject: (id) => api.delete(`/admin/subjects/${id}`),

  // Mapping endpoints
  mapProfessorSubject: (professorId, subjectId) =>
    api.post(`/admin/professors/${professorId}/subjects/${subjectId}`),
  removeProfessorSubject: (professorId, subjectId) =>
    api.delete(`/admin/professors/${professorId}/subjects/${subjectId}`),
  getProfessorSubjects: (professorId) =>
    api.get(`/admin/professors/${professorId}/subjects`),

  assignSubjectBranch: (subjectId, branchId) =>
    api.post(`/admin/subjects/${subjectId}/branches/${branchId}`),
  removeSubjectBranch: (subjectId, branchId) =>
    api.delete(`/admin/subjects/${subjectId}/branches/${branchId}`),
  getSubjectBranches: (subjectId) =>
    api.get(`/admin/subjects/${subjectId}/branches`),

  // Feedback endpoints
  getAllFeedback: () => api.get('/admin/feedback'),
  getFeedback: (id) => api.get(`/admin/feedback/${id}`),
  deleteFeedback: (id) => api.delete(`/admin/feedback/${id}`),

  // Branches endpoints
  getAllBranches: () => api.get('/admin/branches'),
};

// Professor Services
export const professorAPI = {
  getProfessorTimetable: (professorId) =>
    api.get(`/professor/timetable/${professorId}`),
  getTimetableSummary: (professorId) =>
    api.get(`/professor/timetable-summary/${professorId}`),

  addAssignment: (data) => api.post('/professor/assignments', data),
  getProfessorAssignments: (professorId) =>
    api.get(`/professor/assignments/${professorId}`),
  getSubjectAssignments: (subjectId) =>
    api.get(`/professor/assignments/subject/${subjectId}`),
  updateAssignment: (id, data) => api.put(`/professor/assignments/${id}`, data),
  deleteAssignment: (id) => api.delete(`/professor/assignments/${id}`),

  getProfessorSubjects: (professorId) =>
    api.get(`/professor/subjects/${professorId}`),
};

// Student Services
export const studentAPI = {
  getStudentTimetable: (branchId, semester) =>
    api.get(`/student/timetable/${branchId}/${semester}`),
  getStudentTimetableByBatch: (branchId, semester, batchId) =>
    api.get(`/student/timetable/${branchId}/${semester}/${batchId}`),

  getAssignments: (branchId, semester) =>
    api.get(`/student/assignments/${branchId}/${semester}`),
  getAssignmentsBySubject: (subjectId) =>
    api.get(`/student/assignments/subject/${subjectId}`),

  submitFeedback: (data) => api.post('/student/feedback', data),
  getFeedback: (id) => api.get(`/student/feedback/${id}`),
};

// Timetable Services
export const timetableAPI = {
  generateTimetable: (data) => api.post('/timetable/generate', data),
  viewTimetable: (branchId, semester) =>
    api.get(`/timetable/view/${branchId}/${semester}`),
  viewProfessorTimetable: (professorId) =>
    api.get(`/timetable/view-professor/${professorId}`),
  checkConflicts: (branchId, semester) =>
    api.get(`/timetable/check-conflicts/${branchId}/${semester}`),
  getConflicts: (branchId, semester) =>
    api.get(`/timetable/conflicts/${branchId}/${semester}`),
  validateTimetable: (data) => api.post('/timetable/validate', data),
  moveClass: (data) => api.post('/timetable/move-class', data),
  getAvailableSlots: (branchId, semester, currentEntryId) =>
    api.get(`/timetable/available-slots`, {
      params: { branchId, semester, currentEntryId }
    }),
  clearTimetable: (branchId, semester) =>
    api.delete(`/timetable/clear/${branchId}/${semester}`),
  deleteAllTimetables: () => api.delete('/timetable/clear-all'), // ✅ NEW: Delete all timetables
  adjustSlot: (id, data) => api.put(`/timetable/adjust/${id}`, data),
  getProfessorStatistics: (professorId) =>
    api.get(`/timetable/professor-stats/${professorId}`),
  // Export functions
  exportExcel: (branchId, semester) =>
    api.get(`/timetable/export/excel/${branchId}/${semester}`, { responseType: 'blob' }),
  exportPdf: (branchId, semester) =>
    api.get(`/timetable/export/pdf/${branchId}/${semester}`, { responseType: 'blob' }),
  getAllBranches: () => api.get('/admin/branches'),
  getProfessorSubjects: (professorId) =>
    api.get(`/professor/subjects/${professorId}`),
};

export default api;
