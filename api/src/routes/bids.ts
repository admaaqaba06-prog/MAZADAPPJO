import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { BidEngine } from '../services/bidEngine';
import { EscrowStateMachine } from '../services/escrow';
import Redis from 'ioredis';
import { z } from 'zod';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const bidEngine = new BidEngine(redis);
const escrow = new EscrowStateMachine(prisma);

const PostBidSchema = z.object({
  amount: z.number().positive(),
  minIncrement: z.number().positive()
});

export async function bidRoutes(fastify: FastifyInstance) {
  
  fastify.post('/api/auctions/:id/bid', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id: auctionId } = request.params as { id: string };
    const bidderId = (request as any).user?.id || 'demo-bidder-uuid';
    const username = (request as any).user?.username || 'BuyerJoy962';

    // 1. Enforce strict rate limiting (max 3 bids / sec per individual client)
    const rateLimitKey = `ratelimit:bid:${auctionId}:${bidderId}`;
    const localBidCount = await redis.incr(rateLimitKey);
    if (localBidCount === 1) {
      // Set short expiry window for rate limiter
      await redis.expire(rateLimitKey, 1);
    }
    if (localBidCount > 3) {
      return reply.code(429).send({ 
        error: 'High frequency bidding detected.', 
        details: 'You are capped to a maximum of 3 bid requests per second to preserve atomic transaction order.' 
      });
    }

    try {
      const payload = PostBidSchema.parse(request.body);

      // 2. Perform pre-authorization validation on wallet checks from ledger summary
      const { available } = await escrow.computeUserBalance(bidderId);
      if (available < payload.amount) {
        return reply.code(400).send({ 
          error: 'Insufficient clear credit balance.', 
          details: `Requested bid: ${payload.amount} JOD. Available in Escrow wallet: ${available} JOD. Top up balance to continue bidding.` 
        });
      }

      // 3. Atomically evaluate and commit high bidder in Redis using Lua script logic
      const evaluation = await bidEngine.placeBid({
        auctionId,
        bidderId,
        username,
        bidAmount: payload.amount,
        minIncrement: payload.minIncrement
      });

      // 4. Persist the new high bid record log asynchronously to the primary Database
      const newBidLog = await prisma.bid.create({
        data: {
          auctionId,
          bidderId,
          amount: payload.amount,
          isWinning: true
        }
      });

      // 5. Emit real-time WebSocket packet updates to everyone listening to this channel
      const io = (fastify as any).io;
      if (io) {
        io.to(`auction:${auctionId}`).emit('bid:new', {
          amount: payload.amount,
          bidderId,
          username,
          timestamp: new Date().toISOString(),
          timeRemaining: evaluation.endTime - Date.now()
        });

        if (evaluation.extended) {
          io.to(`auction:${auctionId}`).emit('auction:extended', {
            newEndTime: evaluation.endTime,
            extensionCount: evaluation.snipeCount
          });
        }
      }

      return reply.code(200).send({
        status: 'OK',
        message: 'Your bid has been atomically registered as the highest leading post.',
        highestBid: evaluation.amount,
        endTime: evaluation.endTime,
        snipeCount: evaluation.snipeCount
      });

    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Incomplete coordinate dimensions.', issues: error.errors });
      }
      return reply.code(400).send({ error: error.message || 'Bidding engine transaction rolled back.' });
    }
  });

  fastify.get('/api/auctions/:id/bids/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id: auctionId } = request.params as { id: string };
      const bids = await prisma.bid.findMany({
        where: { auctionId },
        orderBy: { amount: 'desc' },
        take: 50,
        include: {
          bidder: {
            select: { id: true, email: true }
          }
        }
      });
      return reply.code(200).send(bids);
    } catch (error: any) {
      return reply.code(500).send({ error: 'Failed to crawl bid log registers.', details: error.message });
    }
  });

}
