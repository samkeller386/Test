import { makeAuthenticatedRequest } from '@/lib/api/convex';

export const getProfileByUserId = async () => {
  try {
    const data = await makeAuthenticatedRequest('/api/profiles', 'POST', {
      type: 'getProfileByUserId',
    });

    return data?.data || null;
  } catch (error) {
    console.error('Error getting profile:', error);
    throw error;
  }
};

export const createProfile = async (
  image_url?: string,
  profile_context?: string,
) => {
  try {
    const data = await makeAuthenticatedRequest('/api/profiles', 'POST', {
      type: 'createProfile',
      image_url,
      profile_context,
    });

    return data?.data || null;
  } catch (error) {
    console.error('Error creating profile:', error);
    throw error;
  }
};

export const updateProfile = async (profile_context: string) => {
  try {
    const data = await makeAuthenticatedRequest('/api/profiles', 'POST', {
      type: 'updateProfile',
      profile_context,
    });

    return data?.data || null;
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
};

export const deleteProfile = async (): Promise<boolean> => {
  try {
    const data = await makeAuthenticatedRequest('/api/profiles', 'POST', {
      type: 'deleteProfile',
    });

    return data?.data || false;
  } catch (error) {
    console.error('Error deleting profile:', error);
    throw error;
  }
};
