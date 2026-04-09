import express from 'express';
import {
  generateQuiz,
  getQuiz,
  getUserQuizzes,
  submitQuizAttempt,
  getUserProgress,
} from '../controllers/quizController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Protected routes
router.post('/generate', protect, generateQuiz);
router.get('/my-quizzes', protect, getUserQuizzes);
router.post('/submit-attempt', protect, submitQuizAttempt);
router.get('/progress/user', protect, getUserProgress);
router.get('/:id', protect, getQuiz);

export default router;
