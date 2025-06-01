import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  query,
} from './_generated/server';
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';

export const createChat = mutation({
  args: {
    chat: v.object({
      id: v.string(),
      user_id: v.string(),
      model: v.string(),
      name: v.string(),
      finish_reason: v.string(),
      sharing: v.union(v.literal('private'), v.literal('public')),
      updated_at: v.number(),
    }),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      await ctx.db.insert('chats', args.chat);
      return { success: true };
    } catch (error) {
      console.error('Error creating chat:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Helper function for shared chat update logic
const updateChatHelper = async (
  ctx: MutationCtx,
  chatId: string,
  updates: {
    name?: string;
    updated_at?: number;
    finish_reason?: string;
    model?: string;
    sharing?: 'private' | 'public';
    last_shared_message_id?: string;
    shared_by?: string;
    shared_at?: number;
  },
) => {
  try {
    const chat = await ctx.db
      .query('chats')
      .withIndex('by_chat_id', (q) => q.eq('id', chatId))
      .first();

    if (!chat) {
      return { success: false, error: 'Chat not found' };
    }

    const updateData = { ...updates };
    if (updateData.updated_at === undefined) {
      updateData.updated_at = Date.now();
    }

    await ctx.db.patch(chat._id, updateData);
    return { success: true };
  } catch (error) {
    console.error('Error updating chat:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const updateChat = mutation({
  args: {
    chatId: v.string(),
    updates: v.object({
      name: v.optional(v.string()),
      updated_at: v.optional(v.number()),
      finish_reason: v.optional(v.string()),
      model: v.optional(v.string()),
      sharing: v.optional(v.union(v.literal('private'), v.literal('public'))),
      last_shared_message_id: v.optional(v.string()),
      shared_by: v.optional(v.string()),
      shared_at: v.optional(v.number()),
    }),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    return updateChatHelper(ctx, args.chatId, args.updates);
  },
});

export const InternalUpdateChat = internalMutation({
  args: {
    chatId: v.string(),
    updates: v.object({
      name: v.optional(v.string()),
      updated_at: v.optional(v.number()),
      finish_reason: v.optional(v.string()),
      model: v.optional(v.string()),
      sharing: v.optional(v.union(v.literal('private'), v.literal('public'))),
      last_shared_message_id: v.optional(v.string()),
      shared_by: v.optional(v.string()),
      shared_at: v.optional(v.number()),
    }),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    return updateChatHelper(ctx, args.chatId, args.updates);
  },
});

export const getChatById = internalQuery({
  args: {
    chatId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id('chats'),
      _creationTime: v.number(),
      id: v.string(),
      user_id: v.string(),
      model: v.string(),
      name: v.string(),
      finish_reason: v.optional(v.string()),
      sharing: v.union(v.literal('private'), v.literal('public')),
      last_shared_message_id: v.optional(v.string()),
      shared_at: v.optional(v.number()),
      shared_by: v.optional(v.string()),
      updated_at: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    try {
      const chat = await ctx.db
        .query('chats')
        .withIndex('by_chat_id', (q) => q.eq('id', args.chatId))
        .first();
      return chat ?? null;
    } catch (error) {
      console.error('Error getting chat by ID:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to get chat',
      );
    }
  },
});

export const deleteChat = internalMutation({
  args: {
    chatId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const chat = await ctx.db
        .query('chats')
        .withIndex('by_chat_id', (q) => q.eq('id', args.chatId))
        .first();

      if (!chat) {
        return { success: false, error: 'Chat not found' };
      }

      await ctx.db.delete(chat._id);
      return { success: true };
    } catch (error) {
      console.error('Error deleting chat:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const deleteAllChats = internalMutation({
  args: {
    userId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const chats = await ctx.db
        .query('chats')
        .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
        .collect();

      for (const chat of chats) {
        try {
          await ctx.db.delete(chat._id);
        } catch (deleteError) {
          console.error(`Error deleting chat ${chat.id}:`, deleteError);
          // Continue with other deletions even if one fails
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting all chats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const getChatsByUserId = internalQuery({
  args: {
    userId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    chats: v.array(
      v.object({
        _id: v.id('chats'),
        _creationTime: v.number(),
        id: v.string(),
        user_id: v.string(),
        model: v.string(),
        name: v.string(),
        finish_reason: v.optional(v.string()),
        sharing: v.union(v.literal('private'), v.literal('public')),
        last_shared_message_id: v.optional(v.string()),
        shared_at: v.optional(v.number()),
        shared_by: v.optional(v.string()),
        updated_at: v.optional(v.number()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    try {
      const result = await ctx.db
        .query('chats')
        .withIndex('by_user_and_updated', (q) => q.eq('user_id', args.userId))
        .order('desc')
        .paginate(args.paginationOpts);

      return {
        chats: result.page,
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      };
    } catch (error) {
      console.error('Error getting chats by user ID:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to get chats',
      );
    }
  },
});

// export const getLastSharedMessageId = query({
//   args: {
//     chatId: v.string(),
//   },
//   returns: v.union(v.string(), v.null()),
//   handler: async (ctx, args) => {
//     try {
//       const chat = await ctx.db
//         .query('chats')
//         .withIndex('by_chat_id', (q) => q.eq('id', args.chatId))
//         .filter((q) => q.eq(q.field('sharing'), 'public'))
//         .unique();

//       return chat?.last_shared_message_id ?? null;
//     } catch (error) {
//       console.error('Error getting last shared message ID:', error);
//       throw new Error(error instanceof Error ? error.message : 'Failed to get last shared message ID');
//     }
//   },
// });

// export const getSharedChatsByUserId = query({
//   args: {
//     userId: v.string(),
//   },
//   returns: v.array(
//     v.object({
//       _id: v.id('chats'),
//       _creationTime: v.number(),
//       id: v.string(),
//       user_id: v.string(),
//       model: v.string(),
//       name: v.string(),
//       finish_reason: v.optional(v.string()),
//       sharing: v.union(v.literal('private'), v.literal('public')),
//       last_shared_message_id: v.optional(v.string()),
//       shared_at: v.optional(v.number()),
//       shared_by: v.optional(v.string()),
//       updated_at: v.optional(v.number()),
//     }),
//   ),
//   handler: async (ctx, args) => {
//     try {
//       const chats = await ctx.db
//         .query('chats')
//         .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
//         .filter((q) => q.eq(q.field('sharing'), 'public'))
//         .order('desc')
//         .collect();

//       return chats;
//     } catch (error) {
//       console.error('Error getting shared chats by user ID:', error);
//       throw new Error(error instanceof Error ? error.message : 'Failed to get shared chats');
//     }
//   },
// });

/**
 * Clean up duplicate chats by keeping only one chat for each id
 * This is a one-time operation to fix duplicate chats after migration
 */
// export const cleanupDuplicateChats = mutation({
//   args: {
//     paginationOpts: paginationOptsValidator, // Required pagination options
//   },
//   returns: v.object({
//     totalProcessed: v.number(),
//     duplicatesRemoved: v.number(),
//     errors: v.array(v.string()),
//     isDone: v.boolean(), // Whether we've processed all chats
//     continueCursor: v.union(v.string(), v.null()), // Cursor for the next batch
//   }),
//   handler: async (ctx, args) => {
//     const stats = {
//       totalProcessed: 0,
//       duplicatesRemoved: 0,
//       errors: [] as string[],
//       isDone: false,
//       continueCursor: null as string | null,
//     };

//     try {
//       // Get chats with pagination
//       const result = await ctx.db
//         .query("chats")
//         .order("desc")
//         .paginate(args.paginationOpts);

//       const chatsToProcess = result.page;
//       stats.totalProcessed = chatsToProcess.length;
//       stats.isDone = result.isDone;
//       stats.continueCursor = result.continueCursor;

//       // Group chats by id
//       const chatsById = new Map<string, typeof chatsToProcess>();
//       for (const chat of chatsToProcess) {
//         const existing = chatsById.get(chat.id) || [];
//         existing.push(chat);
//         chatsById.set(chat.id, existing);
//       }

//       // For each group with duplicates, keep one and delete others
//       for (const [id, chats] of chatsById.entries()) {
//         if (chats.length <= 1) continue; // Skip if no duplicates

//         // Since creation times are the same, we'll keep the first one we find
//         // and delete the rest
//         const [keepChat, ...duplicates] = chats;

//         // Delete all duplicates
//         for (const duplicate of duplicates) {
//           try {
//             await ctx.db.delete(duplicate._id);
//             stats.duplicatesRemoved++;
//           } catch (error) {
//             stats.errors.push(`Failed to delete duplicate chat ${duplicate._id}: ${error}`);
//           }
//         }
//       }

//       return stats;
//     } catch (error) {
//       stats.errors.push(`Failed to process chats: ${error}`);
//       return stats;
//     }
//   },
// });

export const getChatByIdWithValidation = query({
  args: {
    chatId: v.string(),
    userId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id('chats'),
      _creationTime: v.number(),
      id: v.string(),
      user_id: v.string(),
      model: v.string(),
      name: v.string(),
      finish_reason: v.optional(v.string()),
      sharing: v.union(v.literal('private'), v.literal('public')),
      last_shared_message_id: v.optional(v.string()),
      shared_at: v.optional(v.number()),
      shared_by: v.optional(v.string()),
      updated_at: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    try {
      const chat = await ctx.db
        .query('chats')
        .withIndex('by_chat_id', (q) => q.eq('id', args.chatId))
        .first();

      // If chat doesn't exist, return null
      if (!chat) {
        return null;
      }

      if (chat.user_id === args.userId) {
        return chat;
      }

      // If user is not authorized, throw an error
      throw new Error('Unauthorized access to chat');
    } catch (error) {
      console.error('Error validating chat access:', error);
      throw error;
    }
  },
});
