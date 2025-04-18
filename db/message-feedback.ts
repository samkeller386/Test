import { supabase } from '@/lib/supabase/browser-client';
import type { TablesInsert } from '@/supabase/types';
import { updateStoredFeedback, updateStoredFeedbacks } from './local/db';

export const createMessageFeedback = async (
  feedback: TablesInsert<'feedback'>,
) => {
  const { data: createdFeedback, error } = await supabase
    .from('feedback')
    .upsert(feedback, { onConflict: 'user_id, chat_id, message_id' })
    .select('*');

  if (!createdFeedback) {
    throw new Error(error.message);
  }

  await updateStoredFeedbacks(createdFeedback);

  return createdFeedback;
};
