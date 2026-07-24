// Thin History-API serialization layer for the state-based router.
//
// The app has no React Router: navigation is `activeView` / `activeAuctionId`
// (+ overlay flags) in AppContext. These helpers translate a nav "node" to/from
// a real URL PATH so the browser history stays in sync, links are shareable,
// and hardware/gesture Back walks in-app instead of exiting.
//
// Scheme (path-based): `/` = landing, `/discover`, `/sell`, `/auction/<id>`, …
// Modals ride as a query param on top of the path (`/orders?modal=<name>`).
// Legacy query links (`/?auction=<id>`, `/?view=orders`) still PARSE for
// back-compat; the mount effect replaceState()s them onto the new path.

export type NavView =
  | 'landing'
  | 'discovery'
  | 'live'
  | 'wallet'
  | 'orders'
  | 'admin'
  | 'upload'
  | 'about'
  | 'seller-center'
  | 'profile'
  | 'drop-builder'
  | 'auction-drop-builder'
  | 'prohibited-items';

// Single source of truth: view <-> path. `live` is special-cased to
// `/auction/:id` (needs the id) and is intentionally absent here.
const VIEW_PATH: Record<Exclude<NavView, 'live'>, string> = {
  landing: '/',
  discovery: '/discover',
  wallet: '/wallet',
  orders: '/orders',
  admin: '/admin',
  upload: '/sell',
  about: '/how-it-works',
  'seller-center': '/seller',
  profile: '/profile',
  'drop-builder': '/drop-builder',
  'auction-drop-builder': '/auction-drop-builder',
  'prohibited-items': '/prohibited',
};

// Reverse map (path -> view) for exact matches, built once.
const PATH_VIEW: Record<string, Exclude<NavView, 'live'>> = Object.fromEntries(
  Object.entries(VIEW_PATH).map(([view, path]) => [path, view as Exclude<NavView, 'live'>]),
);

// Legacy `?view=` values still accepted from old shared links.
const KNOWN_VIEWS: readonly NavView[] = [
  'landing', 'discovery', 'live', 'wallet', 'orders', 'admin', 'upload',
  'about', 'seller-center', 'profile', 'drop-builder', 'auction-drop-builder',
  'prohibited-items',
];

export interface NavModalParam {
  key: string;
  value: string;
}

export interface NavNode {
  view: NavView;
  auctionId?: string;
  modal?: string;
  modalParam?: NavModalParam;
}

const RESERVED_KEYS = new Set(['view', 'auction', 'modal']);

/** Split a relative URL (`/path?query`) into its pathname and raw query. */
function splitUrl(input: string): { pathname: string; search: string } {
  const raw = input || '/';
  const qIdx = raw.indexOf('?');
  if (qIdx === -1) return { pathname: raw || '/', search: '' };
  return { pathname: raw.slice(0, qIdx) || '/', search: raw.slice(qIdx) };
}

/**
 * Serialize a nav node to a relative URL (pathname + optional modal query).
 *  - landing            -> `/`
 *  - live + auctionId   -> `/auction/<id>`
 *  - any other view     -> its `VIEW_PATH`
 *  - modal              -> `?modal=<name>` (+ optional `&<key>=<value>`) appended
 */
export function serializeNav(node: NavNode): string {
  let pathname: string;
  if (node.view === 'live' && node.auctionId) {
    pathname = `/auction/${encodeURIComponent(node.auctionId)}`;
  } else if (node.view === 'live') {
    // live with no id is meaningless — fall back to discover.
    pathname = VIEW_PATH.discovery;
  } else {
    pathname = VIEW_PATH[node.view] ?? '/';
  }

  const params = new URLSearchParams();
  if (node.modal) {
    params.set('modal', node.modal);
    if (node.modalParam && node.modalParam.key) {
      params.set(node.modalParam.key, node.modalParam.value);
    }
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/**
 * Parse a relative URL (pass `window.location.pathname + window.location.search`)
 * back into a nav node.
 *
 * A Firebase auth-redirect callback (path under `/__/auth`, or an `apiKey` /
 * `authType` param) is normalized to `{view:'discovery'}` so the OAuth handoff
 * is never routed as an app view.
 */
export function parseNav(input: string): NavNode {
  if (input.includes('/__/auth')) {
    return { view: 'discovery' };
  }

  const { pathname, search } = splitUrl(input);
  const params = new URLSearchParams(search || '');

  if (params.has('apiKey') || params.has('authType')) {
    return { view: 'discovery' };
  }

  // Back-compat: honor legacy query links that still land on `/`.
  if (pathname === '/' || pathname === '') {
    const legacyAuction = params.get('auction')?.trim();
    if (legacyAuction) {
      const node: NavNode = { view: 'live', auctionId: legacyAuction };
      applyModal(node, params);
      return node;
    }
    const legacyView = params.get('view')?.trim();
    if (legacyView && (KNOWN_VIEWS as readonly string[]).includes(legacyView)) {
      const node: NavNode = { view: legacyView as NavView };
      applyModal(node, params);
      return node;
    }
    const node: NavNode = { view: 'landing' };
    applyModal(node, params);
    return node;
  }

  // `/auction/:id`
  const auctionMatch = pathname.match(/^\/auction\/([^/]+)\/?$/);
  if (auctionMatch) {
    const node: NavNode = { view: 'live', auctionId: decodeURIComponent(auctionMatch[1]) };
    applyModal(node, params);
    return node;
  }

  // Exact path -> view (normalize a trailing slash).
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const view = PATH_VIEW[normalized];
  const node: NavNode = { view: view ?? 'landing' };
  applyModal(node, params);
  return node;
}

/**
 * True when the ONLY change from `prev` to `next` is a modal closing while the
 * underlying view (and live auction) stays the same. The history sync layer uses
 * this to `replaceState` instead of `pushState` on a button-close so history
 * doesn't become `[view, modal, view']` (which would let Back reopen the modal).
 */
export function isModalCloseTransition(prev: NavNode, next: NavNode): boolean {
  return (
    prev.view === next.view &&
    prev.auctionId === next.auctionId &&
    !!prev.modal &&
    !next.modal
  );
}

function applyModal(node: NavNode, params: URLSearchParams): void {
  const modal = params.get('modal')?.trim();
  if (!modal) return;
  node.modal = modal;
  for (const [key, value] of params.entries()) {
    if (!RESERVED_KEYS.has(key)) {
      node.modalParam = { key, value };
      break;
    }
  }
}
