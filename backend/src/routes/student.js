const express = require('express');
const router = express.Router();
const studentController = require('../controllers/student');

// Timetable routes
router.get('/timetable/:branchId/:semester', studentController.getStudentTimetable);
router.get('/timetable/:branchId/:semester/:batchId', studentController.getStudentTimetableByBatch);

// Assignment routes
router.get('/assignments/:branchId/:semester', studentController.getAssignments);
router.get('/assignments/subject/:subjectId', studentController.getAssignmentsBySubject);

// Feedback routes
router.post('/feedback', studentController.submitFeedback);
router.get('/feedback/:feedbackId', studentController.getFeedback);

module.exports = router;
