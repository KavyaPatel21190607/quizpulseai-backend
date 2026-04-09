import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      default: '',
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    subject: {
      type: String,
      default: '',
      trim: true,
    },
    classLevel: {
      type: String,
      default: '',
      trim: true,
    },
    file: {
      filename: { type: String, required: true },
      url: { type: String, required: true },
      size: { type: Number, required: true },
      type: { type: String, required: true },
      path: { type: String, required: true },
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

resourceSchema.index({ title: 'text', description: 'text', subject: 'text', classLevel: 'text' });
resourceSchema.index({ createdAt: -1 });

export default mongoose.model('Resource', resourceSchema);
