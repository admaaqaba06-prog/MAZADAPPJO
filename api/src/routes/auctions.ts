import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient, AuctionStatus } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const CreateAuctionSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(5).max(1000),
  startingBid: z.number().positive(),
  reservePrice: z.number().nonnegative(),
  category: z.enum(['Electronics', 'Luxury', 'Vehicles', 'Fashion', 'Real Estate']),
  scheduledAt: z.string().datetime(),
});

export async function auctionRoutes(fastify: FastifyInstance) {
  
  // 1. Fetch live or scheduled listings
  fastify.get('/api/auctions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { status } = request.query as { status?: string };
      
      const auctions = await prisma.auction.findMany({
        where: status ? { status: status as AuctionStatus } : undefined,
        include: {
          seller: {
            select: { id: true, email: true, stripeAccountId: true }
          },
          highBidder: {
            select: { id: true, email: true }
          }
        },
        orderBy: { scheduledAt: 'asc' }
      });
      
      return reply.code(200).send(auctions);
    } catch (error: any) {
      return reply.code(500).send({ error: 'Failed to query active streaming auction indices.', details: error.message });
    }
  });

  // 2. Fetch specific listing overview
  fastify.get('/api/auctions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      
      const auction = await prisma.auction.findUnique({
        where: { id },
        include: {
          seller: {
            select: { id: true, email: true }
          },
          bids: {
            orderBy: { amount: 'desc' },
            take: 20
          }
        }
      });
      
      if (!auction) {
        return reply.code(404).send({ error: 'Selected Live stream lot does not exist in central escrow registry.' });
      }
      
      return reply.code(200).send(auction);
    } catch (error: any) {
      return reply.code(500).send({ error: 'Internal system fault retrieving media descriptor.', details: error.message });
    }
  });

  // 3. Create a listing lot
  fastify.post('/api/auctions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = CreateAuctionSchema.parse(request.body);
      const userId = (request as any).user?.id || 'demo-seller-id'; // Auth Middleware provides this

      const auction = await prisma.auction.create({
        data: {
          title: payload.title,
          description: payload.description,
          startingBid: payload.startingBid,
          reservePrice: payload.reservePrice,
          sellerId: userId,
          status: AuctionStatus.SCHEDULED,
          scheduledAt: new Date(payload.scheduledAt),
          maxExtensions: 3
        }
      });

      return reply.code(201).send({ message: 'Live commerce lot submitted successfully to processing board.', auction });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation mismatch on payload inputs.', issues: error.errors });
      }
      return reply.code(500).send({ error: 'Processor rejected auction scheduling creation.', details: error.message });
    }
  });

  // 4. Force transitions to LIVE & register stream feed
  fastify.post('/api/auctions/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      
      const existing = await prisma.auction.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: 'Desired session is target invalid.' });
      }
      if (existing.status !== AuctionStatus.SCHEDULED) {
        return reply.code(400).send({ error: 'Lot has already progressed past SCHEDULED staging.' });
      }

      // Simulate contacting Mux live streaming API provider to mint endpoints
      const simulatedMuxStreamId = `mux-stream-${Math.random().toString(36).substring(7)}`;
      const simulatedPlaybackId = `mux-play-${Math.random().toString(36).substring(7)}`;

      const updated = await prisma.auction.update({
        where: { id },
        data: {
          status: AuctionStatus.LIVE,
          startedAt: new Date(),
          muxStreamId: simulatedMuxStreamId,
          muxPlaybackId: simulatedPlaybackId
        }
      });

      return reply.code(200).send({ 
        message: 'Broadcasting telemetry online. Dynamic ingestion node established.', 
        auction: updated,
        ingestStreamKey: 'live_jo_rtmp_escrow_key_secure',
        playbackUrl: `https://stream.mux.com/${simulatedPlaybackId}.m3u8`
      });
    } catch (error: any) {
      return reply.code(500).send({ error: 'Streaming gateway handshake failed.', details: error.message });
    }
  });
}
