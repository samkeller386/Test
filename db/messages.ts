import { ConvexClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

// Create a single instance of the Convex client
const convex = new ConvexClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const getMessagesByChatId = async (
  chatId: string,
  limit = 20,
  lastSequenceNumber?: number,
) => {
  try {
    // Get messages with feedback and file items from Convex
    const messages = await convex.query(api.messages.getMessagesWithFiles, {
      chatId,
      limit,
      lastSequenceNumber,
    });

    if (!messages) {
      throw new Error('Messages not found');
    }

    return messages;
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }
};
