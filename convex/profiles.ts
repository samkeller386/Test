import {
  internalQuery,
  internalMutation,
  mutation,
  query,
} from './_generated/server';
import { v } from 'convex/values';

/**
 * Get profile by user ID with authentication
 */
export const getProfileByUserId = internalQuery({
  args: { userId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id('profiles'),
      _creationTime: v.number(),
      user_id: v.string(),
      image_url: v.optional(v.string()),
      profile_context: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
      .unique();

    return profile;
  },
});

/**
 * Get profile by user ID with service key (for server-side usage)
 */
export const getProfileByUserIdPublic = query({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id('profiles'),
      _creationTime: v.number(),
      user_id: v.string(),
      image_url: v.optional(v.string()),
      profile_context: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    // Verify service role key
    if (args.serviceKey !== process.env.CONVEX_SERVICE_ROLE_KEY) {
      throw new Error('Unauthorized');
    }

    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
      .unique();

    return profile;
  },
});

/**
 * Get AI profile context by user ID with service key (for server-side usage)
 */
export const getAIProfilePublic = query({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
  },
  returns: v.union(
    v.object({
      user_id: v.string(),
      profile_context: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    // Verify service role key
    if (args.serviceKey !== process.env.CONVEX_SERVICE_ROLE_KEY) {
      throw new Error('Unauthorized');
    }

    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
      .unique();

    if (!profile) {
      return null;
    }

    return {
      user_id: profile.user_id,
      profile_context: profile.profile_context,
    };
  },
});

/**
 * Create a new profile
 */
export const createProfile = internalMutation({
  args: {
    userId: v.string(),
    image_url: v.optional(v.string()),
  },
  returns: v.object({
    _id: v.id('profiles'),
    _creationTime: v.number(),
    user_id: v.string(),
    image_url: v.optional(v.string()),
    profile_context: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Check if profile already exists
    const existingProfile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
      .unique();

    if (existingProfile) {
      throw new Error('Profile already exists for this user');
    }

    const profileId = await ctx.db.insert('profiles', {
      user_id: args.userId,
      image_url: args.image_url,
    });

    const createdProfile = await ctx.db.get(profileId);
    if (!createdProfile) {
      throw new Error('Failed to retrieve created profile');
    }

    return createdProfile;
  },
});

/**
 * Update an existing profile
 */
export const updateProfile = internalMutation({
  args: {
    userId: v.string(),
    profile_context: v.string(),
  },
  returns: v.object({
    _id: v.id('profiles'),
    _creationTime: v.number(),
    user_id: v.string(),
    image_url: v.optional(v.string()),
    profile_context: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const existingProfile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
      .unique();

    if (!existingProfile) {
      throw new Error('Profile not found');
    }

    await ctx.db.patch(existingProfile._id, {
      profile_context: args.profile_context,
    });

    const updatedProfile = await ctx.db.get(existingProfile._id);
    if (!updatedProfile) {
      throw new Error('Failed to retrieve updated profile');
    }

    return updatedProfile;
  },
});

/**
 * Delete a profile and all associated user data
 */
export const deleteProfile = internalMutation({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    try {
      // 1. Delete feedback (references messages)
      const feedback = await ctx.db
        .query('feedback')
        .filter((q) => q.eq(q.field('user_id'), args.userId))
        .collect();

      for (const item of feedback) {
        await ctx.db.delete(item._id);
      }

      // 2. Delete file_items (references files and user)
      const fileItems = await ctx.db
        .query('file_items')
        .filter((q) => q.eq(q.field('user_id'), args.userId))
        .collect();

      for (const item of fileItems) {
        await ctx.db.delete(item._id);
      }

      // 3. Delete files (references user)
      const files = await ctx.db
        .query('files')
        .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
        .collect();

      for (const file of files) {
        await ctx.db.delete(file._id);
      }

      // 4. Delete messages (references user and chats)
      const messages = await ctx.db
        .query('messages')
        .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
        .collect();

      for (const message of messages) {
        await ctx.db.delete(message._id);
      }

      // 5. Delete chats (references user)
      const chats = await ctx.db
        .query('chats')
        .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
        .collect();

      for (const chat of chats) {
        await ctx.db.delete(chat._id);
      }

      // 6. Delete sandboxes (references user)
      const sandboxes = await ctx.db
        .query('sandboxes')
        .filter((q) => q.eq(q.field('user_id'), args.userId))
        .collect();

      for (const sandbox of sandboxes) {
        await ctx.db.delete(sandbox._id);
      }

      // 7. Delete team_members (references user)
      const teamMembers = await ctx.db
        .query('team_members')
        .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
        .collect();

      for (const member of teamMembers) {
        await ctx.db.delete(member._id);
      }

      // 8. Delete team_invitations (references user email - we'll need to get user email first)
      // Note: We can't directly get user email from userId in Convex, so we'll skip this
      // or handle it separately if needed

      // 9. Delete subscriptions (references user)
      const subscriptions = await ctx.db
        .query('subscriptions')
        .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
        .collect();

      for (const subscription of subscriptions) {
        await ctx.db.delete(subscription._id);
      }

      // 10. Finally, delete the profile itself
      const existingProfile = await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
        .unique();

      if (existingProfile) {
        await ctx.db.delete(existingProfile._id);
      }

      return true;
    } catch (error) {
      console.error('Error deleting user profile and data:', error);
      throw new Error(
        `Failed to delete user data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Update profile avatar
 */
export const updateProfileAvatar = mutation({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
    avatarUrl: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    // Verify service role key
    if (args.serviceKey !== process.env.CONVEX_SERVICE_ROLE_KEY) {
      return false;
    }

    const existingProfile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', args.userId))
      .unique();

    if (!existingProfile) {
      throw new Error('Profile not found');
    }

    // Only update avatar if user doesn't already have one
    if (!existingProfile.image_url) {
      await ctx.db.patch(existingProfile._id, {
        image_url: args.avatarUrl,
      });
      return true;
    }

    // Return false if avatar already exists (no update needed)
    return false;
  },
});
