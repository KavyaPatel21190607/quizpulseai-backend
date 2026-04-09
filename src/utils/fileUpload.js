import { createClient } from '@supabase/supabase-js';

let cachedSupabaseClient = null;

const getSupabaseClient = () => {
  if (cachedSupabaseClient) {
    return cachedSupabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required');
  }

  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY is required');
  }

  cachedSupabaseClient = createClient(supabaseUrl, supabaseKey);
  return cachedSupabaseClient;
};

export const uploadFileToSupabase = async (file, folder = 'messages') => {
  try {
    const supabase = getSupabaseClient();

    if (!file) {
      throw new Error('No file provided');
    }

    if (!process.env.SUPABASE_BUCKET) {
      throw new Error('SUPABASE_BUCKET is required');
    }

    const fileName = `${folder}/${Date.now()}_${file.originalname}`;
    const fileBuffer = file.buffer;

    const { data, error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .upload(fileName, fileBuffer, {
        contentType: file.mimetype,
      });

    if (error) {
      throw new Error(error.message);
    }

    // Get public URL
    const { data: publicUrl } = supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .getPublicUrl(fileName);

    return {
      filename: file.originalname,
      url: publicUrl.publicUrl,
      size: file.size,
      type: file.mimetype,
      path: fileName,
    };
  } catch (error) {
    console.error('File upload error:', error);
    throw new Error(`File upload failed: ${error.message}`);
  }
};

export const deleteFileFromSupabase = async (filePath) => {
  try {
    const supabase = getSupabaseClient();

    if (!process.env.SUPABASE_BUCKET) {
      throw new Error('SUPABASE_BUCKET is required');
    }

    const { error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .remove([filePath]);

    if (error) {
      throw new Error(error.message);
    }

    return true;
  } catch (error) {
    console.error('File deletion error:', error);
    throw new Error(`File deletion failed: ${error.message}`);
  }
};
