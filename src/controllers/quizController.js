import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { generateQuizWithGemini } from '../services/geminiService.js';
import mongoose from 'mongoose';

export const generateQuiz = async (req, res, next) => {
  try {
    const { subject, gradeClass, topic, learningObjectives, assessmentType, difficulty, numberOfQuestions, questionTypes } = req.body;

    // Validation
    if (!subject || !gradeClass || !topic) {
      return res.status(400).json({
        success: false,
        message: 'Subject, Grade/Class, and Topic are required',
      });
    }

    // Generate questions using Gemini
    const generatedQuestions = await generateQuizWithGemini({
      subject,
      gradeClass,
      topic,
      learningObjectives,
      assessmentType,
      difficulty,
      numberOfQuestions,
      questionTypes,
    });

    // Create quiz in database
    const quiz = await Quiz.create({
      createdBy: req.user.id,
      subject,
      gradeClass,
      topic,
      learningObjectives,
      assessmentType,
      difficulty,
      numberOfQuestions,
      questions: generatedQuestions.map((q) => ({
        _id: new mongoose.Types.ObjectId(),
        type: q.type,
        question: q.question,
        options: q.options || [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      })),
    });

    res.status(201).json({
      success: true,
      message: 'Quiz generated successfully',
      data: {
        quiz: {
          id: quiz._id,
          subject: quiz.subject,
          gradeClass: quiz.gradeClass,
          topic: quiz.topic,
          numberOfQuestions: quiz.numberOfQuestions,
          difficulty: quiz.difficulty,
          questions: quiz.questions,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getQuiz = async (req, res, next) => {
  try {
    const { id } = req.params;

    const quiz = await Quiz.findById(id).populate('createdBy', 'name email');
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    res.status(200).json({
      success: true,
      data: { quiz },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserQuizzes = async (req, res, next) => {
  try {
    const quizzes = await Quiz.find({ createdBy: req.user.id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        quizzes,
        total: quizzes.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const submitQuizAttempt = async (req, res, next) => {
  try {
    const { quizId, answers, timeSpent } = req.body;

    // Get quiz
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    // Calculate score
    let score = 0;
    const processedAnswers = answers.map((answer) => {
      const question = quiz.questions.find((q) => q._id.toString() === answer.questionId);
      const isCorrect = question && question.correctAnswer === answer.selectedAnswer;
      if (isCorrect) score += 10; // 10 points per correct answer

      return {
        questionId: answer.questionId,
        selectedAnswer: answer.selectedAnswer,
        isCorrect,
        pointsEarned: isCorrect ? 10 : 0,
      };
    });

    const totalPoints = quiz.numberOfQuestions * 10;
    const percentageScore = (score / totalPoints) * 100;

    // Create quiz attempt
    const quizAttempt = await QuizAttempt.create({
      userId: req.user.id,
      quizId,
      answers: processedAnswers,
      score,
      totalPoints,
      percentageScore,
      timeSpent,
      completedAt: new Date(),
      status: 'completed',
    });

    res.status(201).json({
      success: true,
      message: 'Quiz submitted successfully',
      data: {
        quizAttempt: {
          id: quizAttempt._id,
          score,
          totalPoints,
          percentageScore,
          answers: processedAnswers,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserProgress = async (req, res, next) => {
  try {
    const attempts = await QuizAttempt.find({ userId: req.user.id }).populate('quizId', 'subject topic');

    const stats = {
      totalQuizzes: attempts.length,
      averageScore: attempts.length > 0 ? (attempts.reduce((sum, a) => sum + a.percentageScore, 0) / attempts.length).toFixed(2) : 0,
      completedQuizzes: attempts.filter((a) => a.status === 'completed').length,
      totalTimeSpent: attempts.reduce((sum, a) => sum + (a.timeSpent || 0), 0),
    };

    res.status(200).json({
      success: true,
      data: {
        stats,
        attempts,
      },
    });
  } catch (error) {
    next(error);
  }
};
