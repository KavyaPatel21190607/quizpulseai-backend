import User from '../models/User.js';
import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { uploadFileToSupabase } from '../utils/fileUpload.js';

export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name, bio, institution, avatar } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, bio, institution, avatar, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadProfileAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image file',
      });
    }

    if (!req.file.mimetype?.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed for profile avatar',
      });
    }

    const uploaded = await uploadFileToSupabase(req.file, 'avatars');

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: uploaded.url, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        avatar: uploaded,
        user,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getSingleUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id, 'name email avatar bio institution');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

// Admin only
export const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const users = await User.find({}, '-password')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await User.countDocuments();

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminDashboardStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    const totalQuizzes = await Quiz.countDocuments();
    const totalAttempts = await QuizAttempt.countDocuments();
    const completedAttempts = await QuizAttempt.countDocuments({ status: 'completed' });

    // Get average quiz score
    const statsAgg = await QuizAttempt.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, avgScore: { $avg: '$percentageScore' } } },
    ]);

    const averageScore = statsAgg.length > 0 ? statsAgg[0].avgScore.toFixed(2) : 0;

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalStudents,
          totalAdmins,
          totalQuizzes,
          totalAttempts,
          completedAttempts,
          averageScore,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminStudentsOverview = async (req, res, next) => {
  try {
    const students = await User.find({ role: 'student' }, '-password').sort({ createdAt: -1 });

    const performanceAgg = await QuizAttempt.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$userId',
          averageScore: { $avg: '$percentageScore' },
          totalAttempts: { $sum: 1 },
          lastAttemptAt: { $max: '$completedAt' },
        },
      },
    ]);

    const performanceByUser = new Map(
      performanceAgg.map((item) => [String(item._id), item])
    );

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const mappedStudents = students.map((student) => {
      const perf = performanceByUser.get(String(student._id));
      const avgScore = perf?.averageScore;
      const attempts = perf?.totalAttempts || 0;
      const lastAttemptAt = perf?.lastAttemptAt ? new Date(perf.lastAttemptAt) : null;

      let status = student.accountStatus || 'active';

      if (status !== 'suspended') {
        if (!lastAttemptAt || Number.isNaN(lastAttemptAt.getTime())) {
          status = 'inactive';
        } else if (Date.now() - lastAttemptAt.getTime() > THIRTY_DAYS_MS) {
          status = 'inactive';
        } else {
          status = 'active';
        }
      }

      return {
        id: student._id,
        name: student.name,
        email: student.email,
        avatar: student.avatar,
        status,
        performance: typeof avgScore === 'number' ? Number(avgScore.toFixed(1)) : null,
        totalAttempts: attempts,
        lastAttemptAt,
        createdAt: student.createdAt,
      };
    });

    const stats = {
      total: mappedStudents.length,
      active: mappedStudents.filter((s) => s.status === 'active').length,
      inactive: mappedStudents.filter((s) => s.status === 'inactive').length,
      suspended: mappedStudents.filter((s) => s.status === 'suspended').length,
    };

    return res.status(200).json({
      success: true,
      data: {
        students: mappedStudents,
        stats,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const suspendStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const student = await User.findOneAndUpdate(
      { _id: studentId, role: 'student' },
      { accountStatus: 'suspended', updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Student suspended successfully',
      data: { student },
    });
  } catch (error) {
    return next(error);
  }
};

export const unsuspendStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    const student = await User.findOneAndUpdate(
      { _id: studentId, role: 'student' },
      { accountStatus: 'active', updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Student unsuspended successfully',
      data: { student },
    });
  } catch (error) {
    return next(error);
  }
};
