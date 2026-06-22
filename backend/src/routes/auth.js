const express = require('express');
const authController = require('../controllers/auth');

const router = express.Router();

/**
 * Public Routes
 */
router.post('/login', authController.login);
router.post('/developer-login', authController.developerLogin);
router.post('/logout', authController.logout);

/**
 * Protected Routes (require authentication)
 */
router.use(authController.authenticateToken);

/**
 * Developer Panel Routes (admin only)
 */
router.get('/users', authController.getAllUsers);
router.post('/users', authController.createUser);
router.put('/users/password', authController.updateUserPassword);
router.put('/users/status', authController.toggleUserStatus);
router.delete('/users', authController.deleteUser);

module.exports = router;
