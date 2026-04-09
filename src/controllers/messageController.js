import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import { encryptMessage, decryptMessage } from '../utils/encryption.js';
import { uploadFileToSupabase } from '../utils/fileUpload.js';

const normalizeAttachment = (attachment) => {
  if (!attachment) {
    return null;
  }

  if (typeof attachment === 'string') {
    return {
      filename: 'file',
      url: attachment,
      size: 0,
      type: '',
      path: '',
    };
  }

  return {
    filename: attachment.filename || 'file',
    url: attachment.url || '',
    size: Number(attachment.size || 0),
    type: attachment.type || '',
    path: attachment.path || '',
  };
};

const getBlockState = async (currentUserId, targetUserId) => {
  const [currentUser, targetUser] = await Promise.all([
    User.findById(currentUserId).select('blockedUsers'),
    User.findById(targetUserId).select('blockedUsers'),
  ]);

  if (!currentUser || !targetUser) {
    return { blockedByMe: false, blockedMe: false, targetExists: false };
  }

  const blockedByMe = (currentUser.blockedUsers || []).some(
    (id) => String(id) === String(targetUserId)
  );
  const blockedMe = (targetUser.blockedUsers || []).some(
    (id) => String(id) === String(currentUserId)
  );

  return { blockedByMe, blockedMe, targetExists: true };
};

const requireActiveStudent = async (userId) => {
  const user = await User.findById(userId).select('role accountStatus');

  if (!user) {
    return { allowed: false, message: 'User not found' };
  }

  if (user.role === 'student' && user.accountStatus === 'suspended') {
    return { allowed: false, message: 'Your account has been suspended by an administrator' };
  }

  return { allowed: true, message: '' };
};

export const getConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ participants: req.user.id })
      .populate('participants', 'name email avatar')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    const [me, blockers] = await Promise.all([
      User.findById(req.user.id).select('blockedUsers'),
      User.find({ blockedUsers: req.user.id }).select('_id'),
    ]);

    const blockedByMeSet = new Set((me?.blockedUsers || []).map((id) => String(id)));
    const blockedMeSet = new Set((blockers || []).map((u) => String(u._id)));

    const mappedConversations = conversations.map((conversation) => {
      const plain = conversation.toObject();
      const otherParticipant = (plain.participants || []).find(
        (p) => String(p._id) !== String(req.user.id)
      );
      const otherId = String(otherParticipant?._id || '');

      return {
        ...plain,
        blockedByMe: blockedByMeSet.has(otherId),
        blockedMe: blockedMeSet.has(otherId),
      };
    });

    res.status(200).json({
      success: true,
      data: { conversations: mappedConversations },
    });
  } catch (error) {
    next(error);
  }
};

export const getModerationConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({})
      .populate('participants', 'name email avatar role')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    const mapped = conversations.map((conversation) => {
      const plain = conversation.toObject();

      let lastMessageContent = '';
      if (plain?.lastMessage?.content) {
        try {
          lastMessageContent = decryptMessage(plain.lastMessage.content);
        } catch {
          lastMessageContent = plain.lastMessage.content;
        }
      }

      return {
        ...plain,
        lastMessage: plain.lastMessage
          ? {
              ...plain.lastMessage,
              content: lastMessageContent,
            }
          : null,
      };
    });

    return res.status(200).json({
      success: true,
      data: { conversations: mapped },
    });
  } catch (error) {
    return next(error);
  }
};

export const getModerationMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { limit = 200, skip = 0 } = req.query;

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('senderId', 'name avatar email role');

    const mapped = messages
      .map((msg) => {
        const plain = msg.toObject();
        let content = plain.content;
        try {
          content = decryptMessage(plain.content);
        } catch {
          content = plain.content;
        }

        return {
          ...plain,
          content,
          attachments: (plain.attachments || [])
            .map((attachment) => normalizeAttachment(attachment))
            .filter(Boolean),
        };
      })
      .reverse();

    return res.status(200).json({
      success: true,
      data: {
        messages: mapped,
        total: await Message.countDocuments({ conversationId }),
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getOrCreateConversation = async (req, res, next) => {
  try {
    const access = await requireActiveStudent(req.user.id);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: access.message });
    }

    const { userId } = req.params;

    const blockState = await getBlockState(req.user.id, userId);
    if (!blockState.targetExists) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    if (blockState.blockedByMe || blockState.blockedMe) {
      return res.status(403).json({
        success: false,
        message: 'Cannot start conversation due to block settings',
      });
    }

    // Check if conversation exists
    let conversation = await Conversation.findOne({
      participants: { $all: [req.user.id, userId] },
    }).populate('participants', 'name email avatar');

    if (!conversation) {
      // Create new conversation
      conversation = await Conversation.create({
        participants: [req.user.id, userId],
      });

      conversation = await conversation.populate('participants', 'name email avatar');
    }

    res.status(200).json({
      success: true,
      data: { conversation },
    });
  } catch (error) {
    next(error);
  }
};

export const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('senderId', 'name avatar');

    // Decrypt messages
    const decryptedMessages = messages.map((msg) => {
      try {
        const decrypted = decryptMessage(msg.content);
        const normalizedAttachments = (msg.attachments || [])
          .map((attachment) => normalizeAttachment(attachment))
          .filter(Boolean);
        return {
          ...msg.toObject(),
          content: decrypted,
          attachments: normalizedAttachments,
        };
      } catch (error) {
        return msg.toObject();
      }
    });

    res.status(200).json({
      success: true,
      data: {
        messages: decryptedMessages.reverse(),
        total: await Message.countDocuments({ conversationId }),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const { conversationId, receiverId, content } = req.body;
    const attachments = [];

    const access = await requireActiveStudent(req.user.id);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: access.message });
    }

    const blockState = await getBlockState(req.user.id, receiverId);
    if (blockState.blockedByMe || blockState.blockedMe) {
      return res.status(403).json({
        success: false,
        message: 'Message cannot be sent because one user has blocked the other',
      });
    }

    // Encrypt message
    const encryptedContent = encryptMessage(content);

    // Handle file uploads if present
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadedFile = await uploadFileToSupabase(file, 'messages');
        attachments.push(uploadedFile);
      }
    }

    // Create message
    const normalizedAttachments = attachments
      .map((attachment) => normalizeAttachment(attachment))
      .filter(Boolean);

    const message = await Message.create({
      conversationId,
      senderId: req.user.id,
      receiverId,
      content: encryptedContent,
      attachments: normalizedAttachments,
      isEncrypted: true,
    });

    // Update conversation lastMessage
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastMessageTime: new Date(),
      updatedAt: new Date(),
    });

    // Decrypt for response
    const decryptedContent = decryptMessage(message.content);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message: {
          ...message.toObject(),
          content: decryptedContent,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const markMessageAsRead = async (req, res, next) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findByIdAndUpdate(
      messageId,
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: { message },
    });
  } catch (error) {
    next(error);
  }
};

export const searchUsers = async (req, res, next) => {
  try {
    const access = await requireActiveStudent(req.user.id);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: access.message });
    }

    const rawQuery = typeof req.query.query === 'string' ? req.query.query : '';
    const query = rawQuery.trim();

    if (!query || query.length < 1) {
      return res.status(400).json({
        success: false,
        message: 'Query must be at least 1 character',
      });
    }

    // Escape regex special chars to avoid malformed pattern and improve reliability.
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const queryRegex = new RegExp(escapedQuery, 'i');

    const me = await User.findById(req.user.id).select('blockedUsers');
    const blockers = await User.find({ blockedUsers: req.user.id }).select('_id');
    const blockedIds = new Set([
      String(req.user.id),
      ...(me?.blockedUsers || []).map((id) => String(id)),
      ...(blockers || []).map((u) => String(u._id)),
    ]);

    const users = await User.find(
      {
        $or: [{ name: queryRegex }, { email: queryRegex }],
        _id: { $nin: Array.from(blockedIds) },
        role: 'student',
      },
      'name email avatar'
    )
      .sort({ name: 1 })
      .limit(20);

    res.status(200).json({
      success: true,
      data: { users },
    });
  } catch (error) {
    next(error);
  }
};

export const getBlockStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const blockState = await getBlockState(req.user.id, userId);

    if (!blockState.targetExists) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        blockedByMe: blockState.blockedByMe,
        blockedMe: blockState.blockedMe,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const blockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (String(req.user.id) === String(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot block yourself',
      });
    }

    const targetUser = await User.findById(userId).select('_id');
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { blockedUsers: userId },
    });

    return res.status(200).json({
      success: true,
      message: 'Student blocked successfully',
    });
  } catch (error) {
    return next(error);
  }
};

export const unblockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    await User.findByIdAndUpdate(req.user.id, {
      $pull: { blockedUsers: userId },
    });

    return res.status(200).json({
      success: true,
      message: 'Student unblocked successfully',
    });
  } catch (error) {
    return next(error);
  }
};
