'use strict';
// Mask a bidder's display name for PUBLIC exposure (world-readable auction doc +
// bid history). Full names must never appear in public payloads — this keeps a
// recognizable-but-anonymous label (privacy + anti-collusion: a seller can't get
// the bidder's real identity/contact off the public data).
function maskBidderName(name) {
  const s = String(name == null ? '' : name).trim();
  if (!s) return 'Bidder';
  // Use the trimmed full string; keep first + last visible, mask the middle.
  const chars = Array.from(s); // Unicode-safe (Arabic names)
  if (chars.length === 1) return `${chars[0]}***`;
  if (chars.length === 2) return `${chars[0]}***${chars[1]}`;
  return `${chars[0]}***${chars[chars.length - 1]}`;
}
module.exports = { maskBidderName };
