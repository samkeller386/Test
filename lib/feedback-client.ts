import { ConvexClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Feedback } from '@/types/feedback';

// Create a single instance of the Convex client
const convex = new ConvexClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export const getFeedbackForMessages = async (
  messageIds: string[],
): Promise<(Feedback | null)[]> => {
  try {
    const feedbackResults = await convex.query(
      api.feedback.getFeedbackByMessageIds,
      {
        message_ids: messageIds,
      },
    );
    return feedbackResults || [];
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return [];
  }
};
