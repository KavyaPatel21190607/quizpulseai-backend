import mongoose from 'mongoose';

const quizSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
    },
    gradeClass: {
      type: String,
      required: [true, 'Grade/Class is required'],
      trim: true,
    },
    topic: {
      type: String,
      required: [true, 'Topic is required'],
      trim: true,
    },
    learningObjectives: {
      type: String,
      default: '',
    },
    assessmentType: {
      type: String,
      enum: ['formative', 'summative', 'diagnostic'],
      default: 'formative',
    },
    generationMode: {
      type: String,
      enum: ['standard', 'spaced-repetition'],
      default: 'standard',
    },
    repetitionLevel: {
      type: Number,
      default: 0,
    },
    repetitionSourceQuizIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
      },
    ],
    repetitionSourceAttemptIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QuizAttempt',
      },
    ],
    repetitionHistoryNote: {
      type: String,
      default: '',
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    timeLimit: {
      type: Number, // in minutes
      default: 30,
    },
    questions: [
      {
        _id: mongoose.Schema.Types.ObjectId,
        type: {
          type: String,
          enum: ['multiple-choice', 'true-false', 'short-answer'],
          required: true,
        },
        question: {
          type: String,
          required: true,
        },
        options: [String], // For multiple-choice and true-false
        correctAnswer: {
          type: String,
          required: true,
        },
        explanation: String,
      },
    ],
    numberOfQuestions: {
      type: Number,
      default: 10,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Quiz', quizSchema);
