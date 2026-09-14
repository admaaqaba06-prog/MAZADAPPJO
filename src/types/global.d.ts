/**
 * Ambient declarations for globals injected by third-party <script> tags in
 * index.html, which TypeScript cannot see.
 */

/**
 * Meta Pixel (`fbq`), loaded by the snippet in index.html.
 *
 * OPTIONAL ON PURPOSE. The loader is a remote script from
 * connect.facebook.net, so it is absent whenever that request is blocked — ad
 * blockers, strict tracking protection, or simply a slow network during the
 * first paint. Typing it as always-present would let `window.fbq(...)` compile
 * and then throw at runtime for a large share of real users. Declared optional,
 * every call site is forced to guard, which is why src/lib/pixel.ts uses `?.`.
 *
 * The signature is deliberately loose: fbq is variadic and overloaded
 * ('init' | 'track' | 'trackCustom' | 'consent', each with a different tail),
 * and a precise union here would buy nothing — the values are opaque to us and
 * validated by Meta, not by the compiler.
 */
interface Window {
  fbq?: (...args: unknown[]) => void;
  /** Set by the pixel loader itself; declared so nothing trips over it. */
  _fbq?: unknown;
}
