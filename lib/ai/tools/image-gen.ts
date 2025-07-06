import { tool } from 'ai';
import { z } from 'zod';
import { experimental_generateImage as generateImage } from 'ai';
import { openai } from '@ai-sdk/openai';
import PostHogClient from '@/app/posthog';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { checkRatelimitOnApi } from '@/lib/server/ratelimiter';

/**
 * Image generation tool using Vercel's AI SDK with OpenAI's image model
 * Generates images from descriptions
 */
export const createImageGenTool = (profile: any, abortSignal: AbortSignal) => {
  return tool({
    description: `The image_gen tool enables image generation from descriptions. Use it when:
- The user requests an image based on a scene description, such as a diagram, portrait, comic, meme, or any other visual.

Limitations:
- Image editing is not currently supported but will be available soon when the tool can see and manipulate generated images.
- Creating images that include renditions of the user is not currently supported but will be available soon when the tool can see and manipulate generated images.

Guidelines:
- After each image generation, do not mention anything related to download. Do not summarize the image. Do not ask followup question. Do not say ANYTHING after you generate an image.`,
    parameters: z.object({
      prompt: z.string().describe('The prompt to generate the image'),
      size: z
        .string()
        .nullable()
        .describe(
          'The size of the generated image (e.g., "1024x1024", "1792x1024", "1024x1792")',
        ),
      n: z
        .number()
        .min(1)
        .max(4)
        .nullable()
        .describe('The number of images to generate (1-4, default: 1)'),
      transparent_background: z
        .boolean()
        .nullable()
        .describe('Whether to generate image with transparent background'),
    }),
    execute: async ({
      prompt,
      size = '1024x1024',
      n = 1,
      transparent_background = false,
    }) => {
      // Check rate limit for image generation
      console.log('[IMAGE_GEN] Checking rate limit for user:', profile.user_id);

      try {
        const rateLimitStatus = await checkRatelimitOnApi(
          profile.user_id,
          'image-gen',
        );

        if (!rateLimitStatus.allowed) {
          console.log(
            '[IMAGE_GEN] Rate limit exceeded for user:',
            profile.user_id,
          );
          return {
            success: false,
            error: `Rate limit exceeded for image generation. ${rateLimitStatus.info.message}`,
            rateLimitInfo: rateLimitStatus.info,
          };
        }

        console.log(
          '[IMAGE_GEN] Rate limit check passed, remaining:',
          rateLimitStatus.info.remaining,
        );
      } catch (error) {
        console.error('[IMAGE_GEN] Rate limit check failed:', error);
        return {
          success: false,
          error: 'Failed to check rate limit for image generation',
        };
      }

      console.log('[IMAGE_GEN] Starting image generation with parameters:', {
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
        size,
        n,
        transparent_background,
        user_id: profile.user_id,
      });

      // Send prompt and parameters via data stream
      const parametersJson: any = {
        prompt,
        size,
      };

      // Only include non-default values
      if (n !== 1) {
        parametersJson.n = n;
      }
      if (transparent_background === true) {
        parametersJson.transparent_background = transparent_background;
      }

      try {
        const posthog = PostHogClient();
        if (posthog) {
          posthog.capture({
            distinctId: profile.user_id,
            event: 'image_generation_executed',
          });
        }

        // Prepare provider options for transparent background and quality
        const providerOptions: any = {
          openai: { quality: 'high' },
        };
        if (transparent_background) {
          providerOptions.openai.background = 'transparent';
          console.log('[IMAGE_GEN] Transparent background enabled');
        }

        console.log('[IMAGE_GEN] Calling Vercel AI SDK generateImage...');
        // Generate the image using Vercel AI SDK
        const result = await generateImage({
          model: openai.image('gpt-image-1'),
          prompt,
          size: size as '1024x1024' | '1792x1024' | '1024x1792',
          n: n || undefined,
          providerOptions,
          abortSignal,
        });

        console.log(
          '[IMAGE_GEN] Image generation completed. Result structure:',
          {
            hasImage: !!result.image,
            hasImages: !!result.images,
            imagesCount: result.images?.length || 0,
          },
        );

        // Initialize Convex client for storage operations
        console.log('[IMAGE_GEN] Initializing Convex client for storage...');
        if (
          !process.env.NEXT_PUBLIC_CONVEX_URL ||
          !process.env.CONVEX_SERVICE_ROLE_KEY
        ) {
          console.error('[IMAGE_GEN] Missing Convex environment variables');
          throw new Error('Convex environment variables are not configured');
        }

        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
        console.log('[IMAGE_GEN] Convex client initialized successfully');

        // Handle single image or multiple images from Vercel AI SDK
        const images = result.images || (result.image ? [result.image] : []);
        console.log(
          `[IMAGE_GEN] Processing ${images.length} image(s) for storage...`,
        );

        // Save images to Convex storage and collect storage IDs
        const savedImages = await Promise.all(
          images.map(async (image: any, index: number) => {
            console.log(
              `[IMAGE_GEN] Processing image ${index + 1}/${images.length}...`,
            );
            try {
              // Get base64 data from Vercel AI SDK image object
              const base64Data = image.base64;
              if (!base64Data) {
                console.error(
                  `[IMAGE_GEN] No base64 data found for image ${index}`,
                );
                throw new Error('No image data received');
              }

              console.log(
                `[IMAGE_GEN] Image ${index} base64 data length:`,
                base64Data.length,
              );

              // Convert base64 to blob (remove data URL prefix if present)
              const base64String = base64Data.replace(
                /^data:image\/[a-z]+;base64,/,
                '',
              );
              const imageBuffer = Buffer.from(base64String, 'base64');
              const blob = new Blob([imageBuffer], { type: 'image/png' });

              console.log(
                `[IMAGE_GEN] Image ${index} converted to blob, size: ${blob.size} bytes`,
              );

              // Generate upload URL
              console.log(
                `[IMAGE_GEN] Generating upload URL for image ${index}...`,
              );
              const uploadUrl = await convex.mutation(
                api.fileStorage.generateUploadUrl,
                {
                  serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
                },
              );

              if (!uploadUrl) {
                console.error(
                  `[IMAGE_GEN] Failed to generate upload URL for image ${index}`,
                );
                throw new Error('Failed to generate upload URL');
              }

              console.log(
                `[IMAGE_GEN] Upload URL generated for image ${index}`,
              );

              // Upload to Convex storage
              console.log(
                `[IMAGE_GEN] Uploading image ${index} to Convex storage...`,
              );
              const uploadResult = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'image/png' },
                body: blob,
              });

              if (!uploadResult.ok) {
                console.error(`[IMAGE_GEN] Upload failed for image ${index}:`, {
                  status: uploadResult.status,
                  statusText: uploadResult.statusText,
                });
                throw new Error('Failed to upload image to storage');
              }

              const { storageId } = await uploadResult.json();
              console.log(
                `[IMAGE_GEN] Image ${index} uploaded successfully, storageId:`,
                storageId,
              );

              // Get the storage URL for the uploaded image
              const storageUrl = await convex.query(
                api.fileStorage.getFileStorageUrlPublic,
                {
                  serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
                  storageId: storageId as Id<'_storage'>,
                },
              );

              console.log(
                `[IMAGE_GEN] Image ${index} storage URL obtained:`,
                storageUrl,
              );

              return {
                storageId: storageId as Id<'_storage'>,
                storageUrl: storageUrl,
                b64_json: base64String,
                size: blob.size,
                index,
              };
            } catch (error) {
              console.error(`[IMAGE_GEN] Error saving image ${index}:`, error);
              throw error;
            }
          }),
        );

        console.log(
          `[IMAGE_GEN] All ${savedImages.length} images saved successfully`,
        );

        // Return the generated image(s) with storage IDs and URLs
        const response = {
          success: true,
          images: savedImages,
          imagePaths: savedImages.map((img) => img.storageId.toString()), // Return storage IDs as strings for image_paths
          imageUrls: savedImages.map((img) => img.storageUrl), // Return URLs for display
          transparent_background,
          parameters: parametersJson,
        };

        console.log('[IMAGE_GEN] Operation completed successfully:', {
          storageIds: savedImages.map((img) => img.storageId),
          imageUrls: response.imageUrls,
        });

        return response;
      } catch (error) {
        console.error('[IMAGE_GEN] Image generation error:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        const errorResponse = {
          success: false,
          error: `Error generating image: ${errorMessage}`,
        };

        console.error('[IMAGE_GEN] Returning error response:', errorResponse);
        return errorResponse;
      }
    },
  });
};

export default createImageGenTool;
