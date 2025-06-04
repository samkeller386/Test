import { internalMutation, internalQuery, query } from './_generated/server';
import { v } from 'convex/values';

/**
 * Get image URL from storage ID (public function)
 */
export const getImageUrlPublic = query({
  args: {
    serviceKey: v.string(),
    storageId: v.id('_storage'),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    if (args.serviceKey !== process.env.CONVEX_SERVICE_ROLE_KEY) {
      return null;
    }

    try {
      const url = await ctx.storage.getUrl(args.storageId);
      return url;
    } catch (error) {
      console.error('[STORAGE] Failed to get image URL', {
        error: error instanceof Error ? error.message : String(error),
        storageId: args.storageId,
      });
      return null;
    }
  },
});

/**
 * Get image URL from storage ID (internal function)
 */
export const getImageUrl = internalQuery({
  args: {
    storageId: v.id('_storage'),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    try {
      const url = await ctx.storage.getUrl(args.storageId);
      return url;
    } catch (error) {
      console.error('[STORAGE] Failed to get image URL', {
        error: error instanceof Error ? error.message : String(error),
        storageId: args.storageId,
      });
      return null;
    }
  },
});

/**
 * Save an image to a message or chat
 */
export const saveImageToMessage = internalMutation({
  args: {
    storageId: v.id('_storage'),
    userId: v.string(),
    messageId: v.optional(v.string()),
    chatId: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    imagePath: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const { storageId, userId, messageId, chatId } = args;

      // If messageId is provided, update the message's image_paths
      if (messageId) {
        const message = await ctx.db
          .query('messages')
          .withIndex('by_message_id', (q) => q.eq('id', messageId))
          .first();

        if (!message) {
          console.error('[SAVE_IMAGE] Message not found', {
            messageId,
            userId,
          });
          return {
            success: false,
            error: 'Message not found',
          };
        }

        // Add the storage ID to the message's image_paths
        await ctx.db.patch(message._id, {
          image_paths: [...(message.image_paths || []), storageId],
          updated_at: Date.now(),
        });
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error('[SAVE_IMAGE] Operation failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: args.userId,
        messageId: args.messageId,
        storageId: args.storageId,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
