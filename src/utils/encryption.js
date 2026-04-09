import crypto from 'crypto';

const getDerivedKey = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required for message encryption');
  }

  // Use SHA-256 digest as the 32-byte AES key material.
  return crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
};

// SHA-256-derived encryption key, AES-256-CBC payload encryption.
export const encryptMessage = (message) => {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', getDerivedKey(), iv);

    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt message');
  }
};

export const decryptMessage = (encryptedMessage) => {
  try {
    const parts = encryptedMessage.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', getDerivedKey(), iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt message');
  }
};

// Generate a SHA256 hash
export const generateHash = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};
