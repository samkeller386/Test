import type { Tables } from '@/supabase/types';
import { createSupabaseAdminClient } from '@/lib/server/server-utils';
import type { BuiltChatMessage } from '@/types/chat-message';

// Define a type for attachments to avoid linter errors
interface MessageWithAttachments extends BuiltChatMessage {
  attachments?: Array<{ file_id?: string }>;
}

// Define types for content items
interface TextContent {
  type: 'text';
  text: string;
}

export function buildDocumentsText(fileItems: Tables<'file_items'>[]) {
  const fileGroups: Record<
    string,
    { id: string; name: string; content: string[] }
  > = fileItems.reduce(
    (
      acc: Record<string, { id: string; name: string; content: string[] }>,
      item: Tables<'file_items'>,
    ) => {
      if (!acc[item.file_id]) {
        acc[item.file_id] = {
          id: item.file_id,
          name: item.name || 'unnamed file',
          content: [],
        };
      }
      acc[item.file_id].content.push(item.content);
      return acc;
    },
    {},
  );

  const documents = Object.values(fileGroups)
    .map((file: any) => {
      return `<document id="${file.id}">
<source>${file.name}</source>
<document_content>${file.content.join('\n\n')}</document_content>
</document>`;
    })
    .join('\n\n');

  return `<documents>\n${documents}\n</documents>`;
}

/**
 * Process PDF file items directly to get file contents
 * @param fileItem - The file item to process
 * @param userId - User ID for authorization
 * @returns PDF file object or null
 */
export async function processPdfFileItem(
  fileItem: Tables<'file_items'>,
  userId: string,
) {
  try {
    // Check if file might be a PDF based on name
    if (!fileItem.name || !fileItem.name.toLowerCase().endsWith('.pdf')) {
      return null;
    }

    // Create admin client to access database
    const supabaseAdmin = createSupabaseAdminClient();

    // Get the full file metadata
    const { data: fileMetadata, error: metadataError } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('id', fileItem.file_id)
      .single();

    if (metadataError || !fileMetadata) {
      return null;
    }

    // Check authorization
    if (fileMetadata.user_id !== userId) {
      return null;
    }

    // Check if it's a PDF
    if (
      fileMetadata.type !== 'application/pdf' &&
      !fileMetadata.name.toLowerCase().endsWith('.pdf')
    ) {
      return null;
    }

    // Download the file
    const { data: file, error: fileError } = await supabaseAdmin.storage
      .from('files')
      .download(fileMetadata.file_path);

    if (fileError || !file) {
      return null;
    }

    // Convert to buffer for PDF handling
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      type: 'file' as const,
      data: buffer,
      mimeType: 'application/pdf',
    };
  } catch (error) {
    console.error('Error processing PDF file item:', error);
    return null;
  }
}

/**
 * Process message attachments, handling PDFs specially
 * @param attachments - Array of attachment objects from message
 * @param userId - User ID for authorization
 * @returns Object with PDF files and other attachments
 */
export async function processMessageAttachments(
  attachments: any[],
  userId: string,
) {
  // Default return structure
  const result = {
    pdfFiles: [] as Array<{
      type: 'file';
      data: Buffer;
      mimeType: string;
    }>,
    fileIds: [] as string[],
  };

  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return result;
  }

  try {
    // Create admin client to access database
    const supabaseAdmin = createSupabaseAdminClient();

    // Process each attachment
    const attachmentPromises = attachments.map(async (attachment) => {
      if (!attachment.file_id) return null;

      // Get file metadata
      const { data: fileMetadata, error: metadataError } = await supabaseAdmin
        .from('files')
        .select('*')
        .eq('id', attachment.file_id)
        .single();

      if (metadataError || !fileMetadata) {
        return null;
      }

      // Check authorization
      if (fileMetadata.user_id !== userId) {
        return null;
      }

      // Handle PDF files
      if (
        fileMetadata.type === 'application/pdf' ||
        fileMetadata.name?.toLowerCase().endsWith('.pdf')
      ) {
        // Fetch PDF data
        const { data: file, error: fileError } = await supabaseAdmin.storage
          .from('files')
          .download(fileMetadata.file_path);

        if (fileError || !file) {
          return null;
        }

        // Convert to buffer for PDF handling
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        return {
          type: 'pdf',
          fileObj: {
            type: 'file' as const,
            data: buffer,
            mimeType: 'application/pdf',
          },
        };
      } else {
        // For non-PDF files, just return the file ID for regular processing
        return {
          type: 'regular',
          fileId: attachment.file_id,
        };
      }
    });

    const processedAttachments = await Promise.all(attachmentPromises);

    // Filter and organize results
    processedAttachments.forEach((item) => {
      if (!item) return;

      if (item.type === 'pdf' && item.fileObj) {
        result.pdfFiles.push(item.fileObj);
      } else if (item.type === 'regular' && item.fileId) {
        result.fileIds.push(item.fileId);
      }
    });

    return result;
  } catch (error) {
    console.error('Error processing attachments:', error);
    return result;
  }
}

// Helper to add documents text to message content
function addDocumentsTextToMessageContent(content: any, documentsText: string) {
  if (typeof content === 'string') {
    return [
      {
        type: 'text',
        text: `${documentsText}\n\n${content}`,
      } as TextContent,
    ];
  } else if (Array.isArray(content)) {
    // Find the first text item or create one
    const textItem = content.find((item: any) => item.type === 'text') as
      | TextContent
      | undefined;
    if (textItem && typeof textItem.text === 'string') {
      textItem.text = `${documentsText}\n\n${textItem.text}`;
      return content;
    } else {
      return [
        {
          type: 'text',
          text: documentsText,
        } as TextContent,
        ...content,
      ];
    }
  }
  return [
    {
      type: 'text',
      text: documentsText,
    } as TextContent,
  ];
}

// Helper to add a file object to message content
function addFileObjToMessageContent(content: any, fileObj: any) {
  if (typeof content === 'string') {
    return [
      {
        type: 'text',
        text: content,
      } as TextContent,
      fileObj,
    ];
  } else if (Array.isArray(content)) {
    return [...content, fileObj];
  }
  return [fileObj];
}

/**
 * Processes message content and attachments, handling different attachment types appropriately
 * @param messages - The chat messages to process
 * @param attachments - File items to include with the message
 * @param userId - The user ID for authorization
 * @returns The processed messages with attachments included
 */
export async function processMessageContentWithAttachments(
  messages: BuiltChatMessage[],
  attachments: Tables<'file_items'>[],
  userId?: string,
): Promise<BuiltChatMessage[]> {
  if (!messages.length) return messages;

  // Create a copy to avoid mutating the original
  const processedMessages = [...messages];
  const lastMessage = processedMessages[
    processedMessages.length - 1
  ] as MessageWithAttachments;

  // Exit early if we don't have a valid last message or user ID
  if (!lastMessage || !userId) {
    return processedMessages;
  }
  // Exit early if there are no attachments
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return processedMessages;
  }

  try {
    let hasPdfAttachments = false;

    // Process file items for PDFs first
    if (attachments.length > 0) {
      for (const attachment of attachments) {
        const pdfFile = await processPdfFileItem(attachment, userId);
        if (pdfFile) {
          lastMessage.content = addFileObjToMessageContent(
            lastMessage.content,
            pdfFile,
          );
          hasPdfAttachments = true;
        }
      }
      // Only add document text if no PDFs were found
      if (!hasPdfAttachments) {
        const documentsText = buildDocumentsText(attachments);
        lastMessage.content = addDocumentsTextToMessageContent(
          lastMessage.content,
          documentsText,
        );
      }
    }

    // Process JSONB attachments if they exist in the message
    if (lastMessage.attachments && Array.isArray(lastMessage.attachments)) {
      const { pdfFiles, fileIds } = await processMessageAttachments(
        lastMessage.attachments,
        userId,
      );

      // Handle PDF files by adding them as file objects
      if (pdfFiles.length > 0) {
        for (const pdfFile of pdfFiles) {
          lastMessage.content = addFileObjToMessageContent(
            lastMessage.content,
            pdfFile,
          );
          hasPdfAttachments = true;
        }
      }

      // Handle regular files if there are any and no PDFs were found
      if (fileIds.length > 0 && !hasPdfAttachments) {
        const relevantAttachments = attachments.filter((att) =>
          fileIds.includes(att.file_id),
        );
        if (relevantAttachments.length > 0) {
          const documentsText = buildDocumentsText(relevantAttachments);
          lastMessage.content = addDocumentsTextToMessageContent(
            lastMessage.content,
            documentsText,
          );
        }
      }
    }
  } catch (error) {
    console.error('Error processing message attachments:', error);
  }

  return processedMessages;
}
