-- Redis Lua Script for Atomic Bid Placement on MAZAD JO
-- Keys: 
-- KEYS[1]: Auction state key (e.g., 'auction:{auctionId}:state')
-- KEYS[2]: Bid log or high-bid sorted set (e.g., 'auction:{auctionId}:bids')
-- KEYS[3]: High bidder lock key (e.g., 'auction:{auctionId}:leader')
-- Arguments:
-- ARGV[1]: bidderId (String UUID)
-- ARGV[2]: username (String)
-- ARGV[3]: bidAmount (Number, e.g. 1400)
-- ARGV[4]: minIncrement (Number)
-- ARGV[5]: currentTime (Unix timestamp in milliseconds)
-- ARGV[6]: maxExtensions (Integer, e.g., 3)

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

-- 1. Assert auction status is LIVE
if status ~= 'LIVE' then
    return {err = 'ERR_AUCTION_NOT_LIVE'}
end

-- 2. Assert time has not fully expired
if currentTime >= endTime then
    return {err = 'ERR_AUCTION_EXPIRED'}
end

-- 3. Assert bid is greater than current high bid + minimum increment
local requiredBid = currentHighBid + minIncrement
if currentHighBid == 0 then
    requiredBid = minIncrement -- starting price
end

if newBid < requiredBid then
    return {err = 'ERR_BID_TOO_LOW'}
end

-- 4. Update atomic values
rcall('HMSET', KEYS[1], 'highBid', newBid, 'highBidderId', bidderId, 'highBidderUsername', username)
rcall('ZADD', KEYS[2], newBid, bidderId .. ':' .. username)
rcall('SET', KEYS[3], bidderId)

-- 5. Track anti-sniping window (30-second logic)
local timeRemaining = endTime - currentTime
local extended = 0
local newEndTime = endTime

if timeRemaining < 30000 then -- 30 seconds in milliseconds
    if snipeCount < maxExtensions then
        snipeCount = snipeCount + 1
        newEndTime = endTime + 30000 -- extend by 30 seconds
        rcall('HMSET', KEYS[1], 'endTime', newEndTime, 'snipeCount', snipeCount)
        extended = 1
    end
end

-- Return success payload array
return {
    'OK',
    tostring(newBid),
    bidderId,
    username,
    tostring(newEndTime),
    tostring(extended),
    tostring(snipeCount)
}
