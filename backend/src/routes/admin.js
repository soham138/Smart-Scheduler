const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin');

// Professor routes
router.post('/professors', adminController.addProfessor);
router.get('/professors', adminController.getAllProfessors);
router.get('/professors/:id', adminController.getProfessor);
router.put('/professors/:id', adminController.updateProfessor);
router.patch('/professors/:id/status', adminController.toggleProfessorStatus);
router.delete('/professors/:id', adminController.deleteProfessor);

// Subject routes
router.post('/subjects', adminController.addSubject);
router.get('/subjects', adminController.getAllSubjects);
router.get('/subjects/:id', adminController.getSubject);
router.put('/subjects/:id', adminController.updateSubject);
router.delete('/subjects/:id', adminController.deleteSubject);

// Professor-Subject mapping routes
router.post('/professors/:professorId/subjects/:subjectId', adminController.mapProfessorSubject);
router.delete('/professors/:professorId/subjects/:subjectId', adminController.removeProfessorSubject);
router.get('/professors/:professorId/subjects', adminController.getProfessorSubjects);

// Subject-Branch mapping routes
router.post('/subjects/:subjectId/branches/:branchId', adminController.assignSubjectBranch);
router.delete('/subjects/:subjectId/branches/:branchId', adminController.removeSubjectBranch);
router.get('/subjects/:subjectId/branches', adminController.getSubjectBranches);

// Feedback routes
router.get('/feedback', adminController.getAllFeedback);
router.get('/feedback/:id', adminController.getFeedback);
router.delete('/feedback/:id', adminController.deleteFeedback);

// Branches routes
router.get('/branches', adminController.getAllBranches);

module.exports = router;
