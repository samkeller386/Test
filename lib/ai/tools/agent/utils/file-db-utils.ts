import type { FileAttachment } from '@/types';
import { createAdminFile } from '@/db/storage/admin-files';
import type { SandboxManager } from '../types';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

if (
  !process.env.NEXT_PUBLIC_CONVEX_URL ||
  !process.env.CONVEX_SERVICE_ROLE_KEY
) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL or CONVEX_SERVICE_ROLE_KEY environment variable is not defined',
  );
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

export const saveFileToDatabase = async (
  filePath: string,
  content: string,
  userId: string,
  writer: any,
  append?: boolean,
): Promise<FileAttachment | string> => {
  // Extract filename from path
  const fileName = filePath.split('/').pop() || 'untitled.txt';

  // Create a File object from the content
  const file = new File([content], fileName, { type: 'text/plain' });

  // Create file record
  const fileRecord = {
    name: fileName,
    user_id: userId,
    file_path: '',
    size: content.length,
    tokens: 0,
    type: 'text/plain',
  };

  try {
    // Use createAdminFile to handle the file upload and processing
    const createdFile = await createAdminFile(file, fileRecord, append);

    if (!createdFile) {
      writer.write({
        type: 'data',

        value: [
          {
            type: 'text',
            content: `⚠️ Failed to attach file: ${fileName}\n`,
          },
        ],
      });
      return `Failed to attach file: ${fileName}`;
    }

    const fileData: FileAttachment = {
      fileName: createdFile.name,
      id: createdFile._id,
      mimeType: createdFile.type,
      type: 'text',
      url: createdFile.file_path,
    };

    // Send file metadata as a separate attachment
    if (!append) {
      writer.write({
        type: 'data',

        value: [
          {
            type: 'file-attachment',
            content: [fileData],
          },
        ],
      });
    }

    return fileData;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('File must be less than')
    ) {
      writer.write({
        type: 'data',

        value: [
          {
            type: 'text',
            content: `⚠️ File "${fileName}" is too large to be attached (must be less than 30MB)\n`,
          },
        ],
      });
    } else {
      console.error('Error creating file:', error);
      writer.write({
        type: 'data',

        value: [
          {
            type: 'text',
            content: `⚠️ Failed to attach file: ${fileName}\n`,
          },
        ],
      });
    }
    return `Failed to attach file: ${fileName}`;
  }
};

/**
 * Handles file attachments for message tools
 */
export const handleMessageAttachments = async ({
  attachments,
  userID,
  writer,
  sandboxManager,
}: {
  attachments: string | string[];
  userID: string;
  writer: any;
  sandboxManager: SandboxManager;
}): Promise<{ errors: string[] | null; files: string[] }> => {
  if (!attachments) return { errors: null, files: [] };

  try {
    // Get sandbox from manager
    const { sandbox: currentSandbox } = await sandboxManager.getSandbox();

    const filePaths = Array.isArray(attachments) ? attachments : [attachments];
    const errors: string[] = [];
    const files: string[] = [];

    for (const filePath of filePaths) {
      try {
        const content = await currentSandbox.files.read(filePath);
        const result = await saveFileToDatabase(
          filePath,
          content,
          userID,
          writer,
        );

        if (typeof result === 'string') {
          errors.push(`Error processing ${filePath}: ${result}`);
        } else {
          // result is FileAttachment, result.url is actually the storage ID
          // Get the actual URL from Convex storage
          const actualUrl = await convex.query(
            api.fileStorage.getFileStorageUrlPublic,
            {
              serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
              storageId: result.url as Id<'_storage'>,
            },
          );

          if (actualUrl) {
            files.push(actualUrl);
          } else {
            errors.push(`Failed to get URL for ${filePath}`);
          }
        }
      } catch (error) {
        errors.push(
          `Error processing ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return {
      errors: errors.length > 0 ? errors : null,
      files,
    };
  } catch (error) {
    return {
      errors: [
        `Error handling attachments: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
      files: [],
    };
  }
};
