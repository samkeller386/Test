import { createSupabaseAdminClient } from '@/lib/server/server-utils';
import type { TablesInsert } from '@/supabase/types';

const uploadAdminFile = async (
  file: File,
  payload: {
    name: string;
    user_id: string;
    file_id: string;
    supabaseAdmin: any;
  },
) => {
  const sizeLimitMB = Number.parseInt(
    process.env.NEXT_PUBLIC_USER_FILE_SIZE_LIMIT_MB || String(30),
  );
  const MB_TO_BYTES = (mb: number) => mb * 1024 * 1024;
  const SIZE_LIMIT = MB_TO_BYTES(sizeLimitMB);

  if (file.size > SIZE_LIMIT) {
    throw new Error(`File must be less than ${sizeLimitMB}MB`);
  }

  const filePath = `${payload.user_id}/${Buffer.from(payload.file_id).toString('base64')}`;

  const { error } = await payload.supabaseAdmin.storage
    .from('files')
    .upload(filePath, file, {
      upsert: true,
    });

  if (error) {
    throw new Error(`Error uploading file: ${error.message}`);
  }

  return filePath;
};

export const createAdminFile = async (
  file: File,
  fileRecord: TablesInsert<'files'>,
) => {
  const supabaseAdmin = createSupabaseAdminClient();

  let validFilename = fileRecord.name
    .replace(/[^a-z0-9.]/gi, '_')
    .toLowerCase();
  const extension = validFilename.split('.').pop();
  const baseName = validFilename.substring(0, validFilename.lastIndexOf('.'));
  const maxBaseNameLength = 100 - (extension?.length || 0) - 1;
  if (baseName.length > maxBaseNameLength) {
    validFilename = `${baseName.substring(0, maxBaseNameLength)}.${extension}`;
  }
  fileRecord.name = validFilename;

  // Create file record in database
  const { data: createdFile, error } = await supabaseAdmin
    .from('files')
    .insert([fileRecord])
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  // Upload file to storage using admin client
  const filePath = await uploadAdminFile(file, {
    name: createdFile.name,
    user_id: createdFile.user_id,
    file_id: createdFile.id,
    supabaseAdmin,
  });

  // Update file path
  await supabaseAdmin
    .from('files')
    .update({ file_path: filePath })
    .eq('id', createdFile.id);

  // Get the final file record
  const { data: finalFile, error: finalError } = await supabaseAdmin
    .from('files')
    .select('*')
    .eq('id', createdFile.id)
    .single();

  if (finalError) {
    throw new Error(finalError.message);
  }

  return finalFile;
};
