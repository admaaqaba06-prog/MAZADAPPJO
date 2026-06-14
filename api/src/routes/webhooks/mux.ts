import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient, AuctionStatus } from '@prisma/client';

const prisma = new PrismaClient();

export async function muxWebhookRoutes(fastify: FastifyInstance) {
  
  fastify.post('/api/webhooks/mux', async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers['mux-signature'];
    
    // In production, we authenticate using:
    // Mux.Webhooks.verifyHeader(JSON.stringify(request.body), signature, process.env.MUX_WEBHOOK_SECRET)
    
    const body = request.body as any;
    if (!body || !body.type) {
      return reply.code(400).send({ error: 'Mux webhook signature missing or payload format incorrect.' });
    }

    const { type, data } = body;
    const streamId = data?.id;

    console.log(`[MUX WEBHOOK RECEIVED] Event: ${type} for Stream: ${streamId}`);

    try {
      switch (type) {
        case 'video.live_stream.active':
          // Stream has begun broadcasting. Automatically promote associated lot to LIVE status
          await prisma.auction.updateMany({
            where: { muxStreamId: streamId },
            data: { 
              status: AuctionStatus.LIVE,
              startedAt: new Date()
            }
          });
          break;

        case 'video.live_stream.idle':
          // Stream discontinued. Conclude active biddings
          const targetLot = await prisma.auction.findFirst({
            where: { muxStreamId: streamId }
          });

          if (targetLot && targetLot.status === AuctionStatus.LIVE) {
            // Find highest leading candidate
            const highestBid = await prisma.bid.findFirst({
              where: { auctionId: targetLot.id },
              orderBy: { amount: 'desc' }
            });

            await prisma.$transaction(async (tx) => {
              await tx.auction.update({
                where: { id: targetLot.id },
                data: { 
                  status: AuctionStatus.ENDED, 
                  endedAt: new Date(),
                  currentHighBid: highestBid ? highestBid.amount : targetLot.startingBid,
                  currentHighBidderId: highestBid ? highestBid.bidderId : null
                }
              });

              if (highestBid) {
                // Instantly allocate funds ledger to secure locks escrow
                await tx.escrowTransaction.create({
                  data: {
                    auctionId: targetLot.id,
                    buyerId: highestBid.bidderId,
                    sellerId: targetLot.sellerId,
                    amount: highestBid.amount,
                    status: 'FUNDED'
                  }
                });

                // Lock the buyer's balance officially
                await tx.walletLedger.create({
                  data: {
                    userId: highestBid.bidderId,
                    amount: highestBid.amount,
                    type: 'DEBIT',
                    referenceId: targetLot.id,
                    referenceType: 'AUCTION_ESCROW_LOCK'
                  }
                });
              }
            });
          }
          break;

        default:
          break;
      }

      return reply.code(200).send({ received: true });
    } catch (error: any) {
      return reply.code(500).send({ error: 'Prisma state synchronization failure.', details: error.message });
    }
  });

}
