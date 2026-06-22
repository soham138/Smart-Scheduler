const express = require('express');
const router = express.Router();
const professorController = require('../controllers/professor');

// Timetable routes
router.get('/timetable/:professorId', professorController.getProfessorTimetable);
router.get('/timetable-summary/:professorId', professorController.getTimetableSummary);

// Assignment routes
router.post('/assignments', professorController.addAssignment);
router.get('/assignments/:professorId', professorController.getProfessorAssignments);
router.get('/assignments/subject/:subjectId', professorController.getSubjectAssignments);
router.put('/assignments/:assignmentId', professorController.updateAssignment);
router.delete('/assignments/:assignmentId', professorController.deleteAssignment);

// Subject routes
router.get('/subjects/:professorId', professorController.getProfessorSubjects);

module.exports = router;
