import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import User from '../models/User.js';
import { generateQuizWithGemini } from '../services/geminiService.js';
import mongoose from 'mongoose';

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
};

const startOfUtcDay = (value) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const updateLearningStreak = async (userId, completedAt) => {
  const user = await User.findById(userId).select('learningStreak');
  if (!user) {
    return null;
  }

  const streak = user.learningStreak || {};
  const previousCompletedAt = streak.lastQuizCompletedAt ? new Date(streak.lastQuizCompletedAt) : null;
  const currentCompletionAt = new Date(completedAt || Date.now());

  if (previousCompletedAt && normalizeDateKey(previousCompletedAt) === normalizeDateKey(currentCompletionAt)) {
    return streak;
  }

  let current = 1;

  if (previousCompletedAt && !Number.isNaN(previousCompletedAt.getTime())) {
    const diffDays = Math.floor((startOfUtcDay(currentCompletionAt) - startOfUtcDay(previousCompletedAt)) / DAY_MS);
    if (diffDays === 1) {
      current = Number(streak.current || 0) + 1;
    }
  }

  const longest = Math.max(Number(streak.longest || 0), current);

  await User.findByIdAndUpdate(userId, {
    learningStreak: {
      current,
      longest,
      lastQuizCompletedAt: currentCompletionAt,
      updatedAt: new Date(),
    },
  });

  return {
    current,
    longest,
    lastQuizCompletedAt: currentCompletionAt,
  };
};

const difficultyRank = {
  easy: 0,
  medium: 1,
  hard: 2,
};

const difficultyOrder = ['easy', 'medium', 'hard'];

const pickSpacedDifficulty = (baseDifficulty, repetitionLevel) => {
  const baseRank = difficultyRank[baseDifficulty] ?? difficultyRank.medium;
  const adjustedRank = Math.min(baseRank + Math.max(repetitionLevel - 1, 0), difficultyOrder.length - 1);
  return difficultyOrder[adjustedRank];
};

const summarizeQuestionHistory = (quizzes = []) => {
  const questionTexts = [];

  quizzes.forEach((quiz) => {
    (quiz.questions || []).forEach((question) => {
      if (question?.question) {
        questionTexts.push(question.question.trim());
      }
    });
  });

  return questionTexts.slice(0, 20);
};

export const generateQuiz = async (req, res, next) => {
  try {
    const {
      subject,
      gradeClass,
      topic,
      learningObjectives,
      assessmentType,
      difficulty,
      numberOfQuestions,
      questionTypes,
      generationMode = 'standard',
    } = req.body;
    const requestedDifficulty = difficulty || 'medium';

    // Validation
    if (!subject || !gradeClass || !topic) {
      return res.status(400).json({
        success: false,
        message: 'Subject, Grade/Class, and Topic are required',
      });
    }

    const normalizedMode = generationMode === 'spaced-repetition' ? 'spaced-repetition' : 'standard';
    const priorSpacingQuizzes = normalizedMode === 'spaced-repetition'
      ? await Quiz.find({
          createdBy: req.user.id,
          generationMode: 'spaced-repetition',
          subject,
          gradeClass,
          topic,
        })
          .sort({ createdAt: -1 })
          .limit(10)
          .select('questions repetitionLevel createdAt')
      : [];

    const priorSpacingAttempts = normalizedMode === 'spaced-repetition'
      ? await QuizAttempt.find({ userId: req.user.id, status: 'completed' })
          .sort({ completedAt: -1 })
          .limit(10)
          .populate('quizId', 'subject gradeClass topic difficulty generationMode repetitionLevel')
      : [];

    const repetitionLevel = normalizedMode === 'spaced-repetition'
      ? Math.min(priorSpacingQuizzes.length + 1, 10)
      : 0;

    const effectiveDifficulty = normalizedMode === 'spaced-repetition'
      ? pickSpacedDifficulty(requestedDifficulty, repetitionLevel)
      : requestedDifficulty;

    const priorQuestions = summarizeQuestionHistory(priorSpacingQuizzes);
    const recentAttemptSummary = priorSpacingAttempts
      .map((attempt, index) => {
        const score = Number(attempt.percentageScore || 0).toFixed(1);
        const quizTopic = attempt.quizId?.topic || 'Unknown topic';
        const quizDifficulty = attempt.quizId?.difficulty || 'medium';
        return `${index + 1}. ${quizTopic} (${quizDifficulty}, ${score}%)`;
      })
      .join('\n');

    const quizContext = normalizedMode === 'spaced-repetition'
      ? {
          generationMode: normalizedMode,
          repetitionLevel,
          priorQuestions,
          recentAttemptSummary,
          previousQuizIds: priorSpacingQuizzes.map((quiz) => quiz._id),
          previousAttemptIds: priorSpacingAttempts.map((attempt) => attempt._id),
          repetitionHistoryNote: 'Avoid repeating the listed prompts. Increase the cognitive challenge and vary the question framing.',
        }
      : {
          generationMode: normalizedMode,
          repetitionLevel: 0,
          priorQuestions: [],
          recentAttemptSummary: '',
          previousQuizIds: [],
          previousAttemptIds: [],
          repetitionHistoryNote: '',
        };

    // Generate questions using Gemini
    const generatedQuestions = await generateQuizWithGemini({
      subject,
      gradeClass,
      topic,
      learningObjectives,
      assessmentType,
      difficulty: effectiveDifficulty,
      numberOfQuestions,
      questionTypes,
      generationMode: quizContext.generationMode,
      repetitionLevel: quizContext.repetitionLevel,
      priorQuestions: quizContext.priorQuestions,
      recentAttemptSummary: quizContext.recentAttemptSummary,
    });

    // Create quiz in database
    const quiz = await Quiz.create({
      createdBy: req.user.id,
      subject,
      gradeClass,
      topic,
      learningObjectives,
      assessmentType,
      difficulty: effectiveDifficulty,
      numberOfQuestions,
      generationMode: quizContext.generationMode,
      repetitionLevel: quizContext.repetitionLevel,
      repetitionSourceQuizIds: quizContext.previousQuizIds,
      repetitionSourceAttemptIds: quizContext.previousAttemptIds,
      repetitionHistoryNote: quizContext.repetitionHistoryNote,
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
          generationMode: quiz.generationMode,
          repetitionLevel: quiz.repetitionLevel,
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

    const streak = await updateLearningStreak(req.user.id, quizAttempt.completedAt || new Date());

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
        streak,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserProgress = async (req, res, next) => {
  try {
    const [attempts, user] = await Promise.all([
      QuizAttempt.find({ userId: req.user.id }).populate('quizId', 'subject topic difficulty generationMode repetitionLevel'),
      User.findById(req.user.id).select('learningStreak'),
    ]);

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
        streak: user?.learningStreak || { current: 0, longest: 0, lastQuizCompletedAt: null },
      },
    });
  } catch (error) {
    next(error);
  }
};
