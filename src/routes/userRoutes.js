import express from 'express';
import multer from 'multer';
import {
  getProfile,
  updateProfile,
  uploadProfileAvatar,
  getSingleUser,
  getAllUsers,
  getAdminDashboardStats,
  getAdminStudentsOverview,
  suspendStudent,
  unsuspendStudent,
} from '../controllers/userController.js';
import { protect, authorizeRole } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Protected routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.post('/profile/avatar', protect, upload.single('avatar'), uploadProfileAvatar);

// Admin only routes
router.get('/admin/users', protect, authorizeRole('admin'), getAllUsers);
router.get('/admin/stats', protect, authorizeRole('admin'), getAdminDashboardStats);
router.get('/admin/students-overview', protect, authorizeRole('admin'), getAdminStudentsOverview);
router.post('/admin/students/:studentId/suspend', protect, authorizeRole('admin'), suspendStudent);
router.post('/admin/students/:studentId/unsuspend', protect, authorizeRole('admin'), unsuspendStudent);

router.get('/:id', protect, getSingleUser);

export default router;
