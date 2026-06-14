import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function stripeWebhookRoutes(fastify: FastifyInstance) {
  
  fastify.post('/api/webhooks/stripe', async (request: FastifyRequest, reply: FastifyReply) => {
    // Standard Stripe signature validation
    // stripe.webhooks.constructEvent(payload, signature, webhookSecret)
    
    const event = request.body as any;
    if (!event || !event.type) {
      return reply.code(400).send({ error: 'Missing webhook event context payload.' });
    }

    console.log(`[STRIPE WEBHOOK RECEIVED] Event: ${event.type}`);

    try {
      const dataObject = event.data.object;

      switch (event.type) {
        case 'payment_intent.succeeded':
          // Top up wallet balance. Retrieve user associations
          const userId = dataObject.metadata?.userId;
          const topupAmount = Number(dataObject.amount) / 100; // Stripe uses cents

          if (userId) {
            await prisma.walletLedger.create({
              data: {
                userId,
                amount: topupAmount,
                type: 'CREDIT',
                referenceId: dataObject.id,
                referenceType: 'STRIPE_TOPUP'
              }
            });
            console.log(`Successfully credited ${topupAmount} JOD to User ${userId}`);
          }
          break;

        case 'account.updated':
          // Seller Stripe Connect onboard state completed
          const accountId = dataObject.id;
          if (dataObject.charges_enabled && dataObject.details_submitted) {
            await prisma.user.updateMany({
              where: { stripeAccountId: accountId },
              data: { role: 'SELLER' } // Promote state safely
            });
            console.log(`Seller account active, promovated role for Connect: ${accountId}`);
          }
          break;

        default:
          break;
      }

      return reply.code(200).send({ received: true });
    } catch (error: any) {
      return reply.code(500).send({ error: 'Stripe transaction database update failure.', details: error.message });
    }
  });

}
