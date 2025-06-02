// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { unixToDateString } from '@/lib/utils';
import { getStripe } from '@/lib/server/stripe';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import Stripe from 'stripe';

export const runtime = 'edge';

if (
  !process.env.NEXT_PUBLIC_CONVEX_URL ||
  !process.env.CONVEX_SERVICE_ROLE_KEY
) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL or CONVEX_SERVICE_ROLE_KEY environment variable is not defined',
  );
}

const convexKey = process.env.CONVEX_SERVICE_ROLE_KEY;
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

export async function POST(request: Request) {
  const signature = request.headers.get('Stripe-Signature');

  // This is needed in order to use the Web Crypto API in Deno.
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  // First step is to verify the event. The .text() method must be used as the
  // verification relies on the raw request body rather than the parsed JSON.
  const body = await request.text();
  let receivedEvent;
  try {
    const stripe = getStripe();
    if (!signature) {
      throw new Error('No signature found in request headers');
    }
    const webhookSecret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
    if (!webhookSecret) {
      throw new Error('Missing Stripe webhook signing secret');
    }
    receivedEvent = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (err: any) {
    console.error(err.message);
    return new Response(err.message, { status: 400 });
  }
  // console.log(`🔔 Event received: ${receivedEvent.id} ${receivedEvent.type}`)

  // Reference:
  // https://stripe.com/docs/billing/subscriptions/build-subscriptions
  try {
    switch (receivedEvent.type) {
      // Payment is successful and the subscription is created.
      // You should provision the subscription and save the customer ID to your database.
      case 'checkout.session.completed':
      case 'invoice.paid': {
        const subscriptionId = receivedEvent.data.object.subscription;
        const customerId = receivedEvent.data.object.customer;
        if (
          typeof subscriptionId === 'string' &&
          typeof customerId === 'string'
        ) {
          await upsertSubscription(subscriptionId, customerId);
        }
        break;
      }
      case 'customer.subscription.updated':
        await upsertSubscription(
          receivedEvent.data.object.id as string,
          receivedEvent.data.object.customer as string,
        );
        break;
      case 'customer.subscription.deleted':
        await deleteSubscription(
          receivedEvent.data.object as Stripe.Subscription,
        );
        break;
      case 'invoice.payment_failed':
        // The payment failed or the customer does not have a valid payment method.
        // The subscription becomes past_due. Notify your customer and send them to the
        // customer portal to update their payment information.
        break;
      default:
      // Unhandled event type
    }
  } catch (err: any) {
    console.error(err.message);
    return new Response(err.message, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

// Retry configuration
const MAX_RETRY_ATTEMPTS = 5; // Maximum number of retry attempts
const RETRY_DELAY_MS = 2000; // Delay between retries in milliseconds

// Modified upsertSubscription function with retry mechanism
async function upsertSubscription(
  subscriptionId: string,
  customerId: string,
  attempt = 0,
) {
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted) {
    throw new Error(`No customer found. customerId: ${customerId}`);
  }

  // Get user ID from customer metadata
  const userId = customer.metadata.userId;
  if (!userId) {
    if (attempt < MAX_RETRY_ATTEMPTS) {
      // If userId is not found and maximum retry attempts are not reached, retry after a delay
      setTimeout(
        () => upsertSubscription(subscriptionId, customerId, attempt + 1),
        RETRY_DELAY_MS,
      );
      return;
    } else {
      // If maximum retry attempts are reached and userId is still not found, throw an error
      console.error(
        'No userId found in customer metadata after maximum retry attempts.',
        customer.metadata,
      );
      throw new Error(
        `No userId found. Maximum retry attempts reached. customerId: ${customerId}`,
      );
    }
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Determine the plan type and team name
  const planType = subscription.metadata.teamName ? 'team' : 'pro';
  const teamName = subscription.metadata.teamName || null;

  // Get user email from customer object (required for team subscriptions)
  const userEmail = customer.email;

  try {
    await convex.mutation(api.subscriptions.upsertSubscription, {
      serviceKey: convexKey,
      subscriptionId,
      userId,
      customerId,
      status: subscription.status,
      startDate: unixToDateString(subscription.start_date),
      cancelAt: unixToDateString(subscription.cancel_at),
      canceledAt: unixToDateString(subscription.canceled_at),
      endedAt: unixToDateString(subscription.ended_at),
      planType,
      teamName: teamName || undefined,
      quantity: subscription.items.data[0].quantity || 1,
      userEmail: userEmail || undefined, // Required for team subscriptions
    });
  } catch (error) {
    console.error('Error upserting subscription:', error);
    throw error;
  }
}

async function deleteSubscription(subscription: Stripe.Subscription) {
  try {
    await convex.mutation(api.subscriptions.deleteSubscription, {
      serviceKey: convexKey,
      subscriptionId: subscription.id,
    });
  } catch (error) {
    console.error('Error deleting subscription:', error);
    throw error;
  }
}
