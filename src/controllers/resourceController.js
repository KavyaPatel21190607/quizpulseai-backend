import Resource from '../models/Resource.js';
import { uploadFileToSupabase } from '../utils/fileUpload.js';

export const uploadResource = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please select a file to upload',
      });
    }

    const title = (req.body.title || req.file.originalname || '').trim();
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required',
      });
    }

    const uploadedFile = await uploadFileToSupabase(req.file, 'resources');

    const resource = await Resource.create({
      title,
      description: (req.body.description || '').trim(),
      subject: (req.body.subject || '').trim(),
      classLevel: (req.body.classLevel || '').trim(),
      file: uploadedFile,
      uploadedBy: req.user.id,
    });

    const populated = await resource.populate('uploadedBy', 'name email role');

    return res.status(201).json({
      success: true,
      message: 'Resource uploaded successfully',
      data: { resource: populated },
    });
  } catch (error) {
    return next(error);
  }
};

export const getResources = async (req, res, next) => {
  try {
    const query = (req.query.query || '').toString().trim();

    const filter = query
      ? {
          $or: [
            { title: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { subject: { $regex: query, $options: 'i' } },
            { classLevel: { $regex: query, $options: 'i' } },
          ],
        }
      : {};

    const resources = await Resource.find(filter)
      .populate('uploadedBy', 'name email role')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: { resources },
    });
  } catch (error) {
    return next(error);
  }
};
