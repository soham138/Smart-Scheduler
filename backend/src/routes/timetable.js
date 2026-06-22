const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetable');
const exportController = require('../controllers/exportController');

// Timetable generation and display routes
router.post('/generate', timetableController.generateTimetable);
router.post('/generate-all', timetableController.generateAllTimetables); // ✅ NEW: Auto-generate
router.delete('/clear/:branchId/:semester', timetableController.clearTimetable);
router.delete('/clear-all', timetableController.clearAllTimetables); // ✅ NEW: Clear entire timetable
router.get('/view/:branchId/:semester', timetableController.viewTimetable);
router.get('/view-professor/:professorId', timetableController.viewProfessorTimetable);
router.get('/view-master/:semester', timetableController.viewMasterTimetable);
router.get('/check-conflicts/:branchId/:semester', timetableController.checkConflicts);
router.get('/conflicts/:branchId/:semester', timetableController.getConflicts);
router.post('/validate', timetableController.validateTimetable);
router.post('/move-class', timetableController.moveClass);
router.get('/available-slots', timetableController.getAvailableSlots);
router.put('/adjust/:timetableId', timetableController.adjustSlot);
router.get('/professor-stats/:professorId', timetableController.getProfessorStatistics);

// Export routes
router.get('/export/excel/:branchId/:semester', exportController.exportExcel);
router.get('/export/pdf/:branchId/:semester', exportController.exportPdf);

module.exports = router;
