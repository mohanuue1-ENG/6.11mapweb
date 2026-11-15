import crypto from 'node:crypto';
import Stripe from 'stripe';

// The payment provider behind online sign-up.
//
//   stripe  Used whenever STRIPE_SECRET_KEY is set. Stripe Checkout (monthly subscription).
//   mock    Local development only (never in production, never when Stripe is configured):
//           a fake checkout page that "pays" with one click, so the whole flow can be tried
//           without a payment account.
//   null    Production without Stripe: online sign-up is switched off (503).
//
// A provider offers createCheckout({ request, plan, successUrl, cancelUrl }) -> { url, sessionId }.
export function createPaymentProvider(config) {
  if (config.stripeSecretKey) {
    const stripe = new Stripe(config.stripeSecretKey);
    return {
      name: 'stripe',
      async createCheckout({ request, plan, successUrl, cancelUrl }) {
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer_email: request.email,
          client_reference_id: request.id,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: plan.price_cents,
                recurring: { interval: 'month' },
                product_data: { name: `6.11 Drive GPS — ${plan.name}` },
              },
            },
          ],
          metadata: { requestId: request.id },
          subscription_data: { metadata: { requestId: request.id } },
          success_url: successUrl,
          cancel_url: cancelUrl,
        });
        return { url: session.url, sessionId: session.id };
      },
      // Verifies Stripe's signature on the raw body and returns the event.
      constructEvent(rawBody, signature) {
        return stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
      },
    };
  }

  if (!config.isProduction) {
    return {
      name: 'mock',
      async createCheckout({ config: c = config }) {
        const sessionId = `mock_${crypto.randomBytes(16).toString('hex')}`;
        return { url: `${c.appUrl}/mock-checkout?session=${sessionId}`, sessionId };
      },
    };
  }

  return null;
}
