// Pure video-URL resolution decision shared by the room's single-doc
// subscription (`useAuctionDoc`). Extracted here (firebase-free) so it is unit
// testable in the repo's `node` test environment without loading firebase.
//
// Mirrors AppContext's broad-path `mapAuctionDoc` three-branch resolution EXACTLY
// (cache hit / direct network URL / queue-for-async), keyed by a
// `{rawUrl, resolvedUrl}` cache entry. See `hooks/useAuctionDoc.ts` for how the
// branches drive caching + async `resolveVideoUrl`.

export interface ResolvedVideoDecision {
  /** The video URL to display right now. */
  videoUrl: string;
  /** True when the raw URL is a `blob:`/empty that must be resolved via IndexedDB. */
  needsAsync: boolean;
  /** True when a direct network URL should be cached as its own resolution. */
  cacheDirect: boolean;
}

/**
 * Decide a lot's displayable video URL from its mapped raw `videoUrl` and the
 * current cache entry for its id.
 * 1. Cache hit (same rawUrl) → reuse the cached resolved URL, no async work.
 * 2. Direct network URL (non-blob, non-empty) → already playable; cache it.
 * 3. Otherwise (`blob:`/empty, uncached) → needs async IndexedDB resolution.
 */
export function resolveCachedVideo(
  rawVideoUrl: string,
  cached: { rawUrl: string; resolvedUrl: string } | undefined
): ResolvedVideoDecision {
  if (cached && cached.rawUrl === rawVideoUrl) {
    return { videoUrl: cached.resolvedUrl, needsAsync: false, cacheDirect: false };
  }
  if (rawVideoUrl && !rawVideoUrl.startsWith('blob:')) {
    return { videoUrl: rawVideoUrl, needsAsync: false, cacheDirect: true };
  }
  return { videoUrl: rawVideoUrl, needsAsync: true, cacheDirect: false };
}
