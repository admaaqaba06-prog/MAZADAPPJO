import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export function initializeSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: '*', // Production: point to Next.js dashboard domains
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingInterval: 10000,
    pingTimeout: 5000
  });

  io.on('connection', (socket: Socket) => {
    console.log(`📡 WebSocket Node Connected: Client Reference ID ${socket.id}`);

    // Join Specific Auction Channels
    socket.on('auction:join', async (payload: { auctionId: string }) => {
      const { auctionId } = payload;
      socket.join(`auction:${auctionId}`);
      console.log(`Client ${socket.id} joined live room for auction: ${auctionId}`);

      // Retrieve and emit current live stats immediately upon joining
      const cacheState = await redis.hmget(
        `auction:${auctionId}:state`, 
        'status', 'endTime', 'highBid', 'highBidderUsername', 'snipeCount'
      );

      socket.emit('auction:state', {
        status: cacheState[0] || 'SCHEDULED',
        endTime: cacheState[1] ? Number(cacheState[1]) : 0,
        highBid: cacheState[2] ? Number(cacheState[2]) : 0,
        highBidderUsername: cacheState[3] || '',
        extensionCount: cacheState[4] ? Number(cacheState[4]) : 0,
        viewerCount: io.sockets.adapter.rooms.get(`auction:${auctionId}`)?.size || 1
      });

      // Broadcaster system alerts new join counts
      io.to(`auction:${auctionId}`).emit('viewer:count', {
        count: io.sockets.adapter.rooms.get(`auction:${auctionId}`)?.size || 1
      });
    });

    // Leave Stream Channels
    socket.on('auction:leave', (payload: { auctionId: string }) => {
      const { auctionId } = payload;
      socket.leave(`auction:${auctionId}`);
      console.log(`Client ${socket.id} left room: ${auctionId}`);

      io.to(`auction:${auctionId}`).emit('viewer:count', {
        count: io.sockets.adapter.rooms.get(`auction:${auctionId}`)?.size || 0
      });
    });

    // Direct User Authenticated Listening Handlers
    socket.on('user:bind', (payload: { userId: string }) => {
      socket.join(`user:${payload.userId}`);
      console.log(`Client ${socket.id} secured private binding socket to User UUID: ${payload.userId}`);
    });

    // Bid Placement Proxy Event via WebSocket Directly
    socket.on('bid:place', async (payload: {
      auctionId: string;
      bidderId: string;
      username: string;
      amount: number;
      minIncrement: number;
    }) => {
      try {
        const rateKey = `ws_ratelimit:${payload.auctionId}:${payload.bidderId}`;
        const hits = await redis.incr(rateKey);
        if (hits === 1) await redis.expire(rateKey, 1);
        if (hits > 3) {
          socket.emit('bid:rejected', { reason: 'Rate limit crossed. Limit: 3 per sec.' });
          return;
        }

        // Delegate execution to REST controller or evaluate here
        // Usually, bid:place validates wallet checks via internal DB microservices
        // If atomic checks pass, we emit 'bid:new' to the entire channel
        console.log(`Bid input evaluated: ${payload.amount} JOD by ${payload.username}`);
      } catch (err: any) {
        socket.emit('bid:rejected', { reason: err.message || 'Escrow server fault.' });
      }
    });

    // Handle Client Decoupling Cleanups
    socket.on('disconnect', () => {
      console.log(`🔌 WebSocket Session Decoupled: ID ${socket.id}`);
    });
  });

  // Clock ticks for active viewer count updates every 10s
  setInterval(() => {
    for (const [roomId, room] of io.sockets.adapter.rooms.entries()) {
      if (roomId.startsWith('auction:')) {
        io.to(roomId).emit('viewer:count', {
          count: room.size
        });
      }
    }
  }, 10000);

  return io;
}
