import { Redis } from 'ioredis';
import fs from 'fs';
import path from 'path';

export interface BidSuccessResult {
  status: 'OK';
  amount: number;
  bidderId: string;
  username: string;
  endTime: number;
  extended: boolean;
  snipeCount: number;
}

export class BidEngine {
  private redis: Redis;
  private luaScriptSHA: string | null = null;
  private luaScriptContent: string;

  constructor(redisClient: Redis) {
    this.redis = redisClient;
    // Load Lua script from external definition or inline
    try {
      const scriptPath = path.resolve(__dirname, 'bidLuaScript.lua');
      this.luaScriptContent = fs.readFileSync(scriptPath, 'utf-8');
    } catch {
      // Fallback to embedded copy if path resolution differs in running env
      this.luaScriptContent = `
        local auctionState = rcall('HMGET', KEYS[1], 'status', 'endTime', 'highBid', 'snipeCount')
        local status = auctionState[1]
        local endTime = tonumber(auctionState[2])
        local currentHighBid = tonumber(auctionState[3]) or 0
        local snipeCount = tonumber(auctionState[4]) or 0

        local newBid = tonumber(ARGV[3])
        local minIncrement = tonumber(ARGV[4])
        local bidderId = ARGV[1]
        local username = ARGV[2]
        local currentTime = tonumber(ARGV[5])
        local maxExtensions = tonumber(ARGV[6])

        if status ~= 'LIVE' then
            return {err = 'ERR_AUCTION_NOT_LIVE'}
        end

        if currentTime >= endTime then
            return {err = 'ERR_AUCTION_EXPIRED'}
        end

        local requiredBid = currentHighBid + minIncrement
        if currentHighBid == 0 then
            requiredBid = minIncrement
        end

        if newBid < requiredBid then
            return {err = 'ERR_BID_TOO_LOW'}
        end

        rcall('HMSET', KEYS[1], 'highBid', newBid, 'highBidderId', bidderId, 'highBidderUsername', username)
        rcall('ZADD', KEYS[2], newBid, bidderId .. ':' .. username)
        rcall('SET', KEYS[3], bidderId)

        local timeRemaining = endTime - currentTime
        local extended = 0
        local newEndTime = endTime

        if timeRemaining < 30000 then
            if snipeCount < maxExtensions then
                snipeCount = snipeCount + 1
                newEndTime = endTime + 30000
                rcall('HMSET', KEYS[1], 'endTime', newEndTime, 'snipeCount', snipeCount)
                extended = 1
            end
        end

        return {
            'OK',
            tostring(newBid),
            bidderId,
            username,
            tostring(newEndTime),
            tostring(extended),
            tostring(snipeCount)
        }
      `;
    }
  }

  /**
   * Initializes evaluation script with Redis server
   */
  public async loadScript(): Promise<void> {
    this.luaScriptSHA = await this.redis.script('LOAD', this.luaScriptContent) as string;
  }

  /**
   * Atomically executes direct bid update
   */
  public async placeBid(params: {
    auctionId: string;
    bidderId: string;
    username: string;
    bidAmount: number;
    minIncrement: number;
    maxExtensions?: number;
  }): Promise<BidSuccessResult> {
    if (!this.luaScriptSHA) {
      await this.loadScript();
    }

    const keys = [
      `auction:${params.auctionId}:state`,
      `auction:${params.auctionId}:bids`,
      `auction:${params.auctionId}:leader`
    ];

    const args = [
      params.bidderId,
      params.username,
      params.bidAmount.toString(),
      params.minIncrement.toString(),
      Date.now().toString(),
      (params.maxExtensions ?? 3).toString()
    ];

    try {
      const result = await this.redis.evalsha(
        this.luaScriptSHA!,
        keys.length,
        ...keys,
        ...args
      ) as string[];

      return {
        status: 'OK',
        amount: Number(result[1]),
        bidderId: result[2],
        username: result[3],
        endTime: Number(result[4]),
        extended: result[5] === '1',
        snipeCount: Number(result[6]),
      };
    } catch (err: any) {
      if (err.message && err.message.includes('NOSCRIPT')) {
        // Fallback and reload
        this.luaScriptSHA = null;
        return this.placeBid(params);
      }
      
      // Parse detailed error keys
      const errorMsg = err.message || '';
      if (errorMsg.includes('ERR_AUCTION_NOT_LIVE')) {
        throw new Error('This auction is currently not in a broadcast biddable state.');
      } else if (errorMsg.includes('ERR_AUCTION_EXPIRED')) {
        throw new Error('This stream auction has already concluded.');
      } else if (errorMsg.includes('ERR_BID_TOO_LOW')) {
        throw new Error('Bid amount does not satisfy the current high bid and increment requirement.');
      }
      
      throw new Error(`Escrow Hold Rejected: ${errorMsg}`);
    }
  }

  /**
   * Seeds database cache state during auction initialization
   */
  public async initializeAuctionState(params: {
    auctionId: string;
    endTime: number;
    startingBid: number;
  }): Promise<void> {
    const key = `auction:${params.auctionId}:state`;
    await this.redis.hmset(key, {
      status: 'LIVE',
      endTime: params.endTime.toString(),
      highBid: '0',
      highBidderId: '',
      highBidderUsername: '',
      snipeCount: '0'
    });
  }
}
