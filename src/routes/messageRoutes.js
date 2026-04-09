import express from 'express';
import multer from 'multer';
import {
  getConversations,
  getModerationConversations,
  getModerationMessages,
  getOrCreateConversation,
  getMessages,
  sendMessage,
  markMessageAsRead,
  searchUsers,
  blockUser,
  unblockUser,
  getBlockStatus,
} from '../controllers/messageController.js';
import { protect, authorizeRole } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Protected routes
router.get('/conversations', protect, getConversations);
router.get('/admin/conversations', protect, authorizeRole('admin'), getModerationConversations);
router.get('/admin/messages/:conversationId', protect, authorizeRole('admin'), getModerationMessages);
router.post('/conversations/:userId', protect, getOrCreateConversation);
router.get('/messages/:conversationId', protect, getMessages);
router.post('/send', protect, upload.array('attachments', 5), sendMessage);
router.put('/messages/:messageId/read', protect, markMessageAsRead);
router.get('/search/users', protect, searchUsers);
router.get('/users/:userId/block-status', protect, getBlockStatus);
router.post('/users/:userId/block', protect, blockUser);
router.post('/users/:userId/unblock', protect, unblockUser);

// Backward-compatible aliases
router.get('/:userId/block-status', protect, getBlockStatus);
router.post('/:userId/block', protect, blockUser);
router.post('/:userId/unblock', protect, unblockUser);

export default router;
