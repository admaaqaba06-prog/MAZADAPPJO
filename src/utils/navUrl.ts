// Thin History-API serialization layer for the state-based router.
//
// The app has no React Router: navigation is `activeView` / `activeAuctionId`
// (+ overlay flags) in AppContext. These helpers translate a nav "node" to/from
// a URL search string so the browser history stays in sync and hardware/gesture
// Back walks in-app instead of exiting.

export type NavView =
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
  | 'auction-drop-builder';

const KNOWN_VIEWS: readonly NavView[] = [
  'discovery',
  'live',
  'wallet',
  'orders',
  'admin',
  'upload',
  'about',
  'seller-center',
  'profile',
  'drop-builder',
  'auction-drop-builder',
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

// Reserved query keys the nav layer owns; anything else riding alongside a modal
// is treated as that modal's single param.
const RESERVED_KEYS = new Set(['view', 'auction', 'modal']);

/**
 * Serialize a nav node to a search string (including the leading `?`), or `''`.
 *
 * Scheme:
 *  - discovery with no auction/modal -> '' (home stays a clean `/`)
 *  - live + auctionId               -> `?auction=<id>` (reuses deepLink param)
 *  - any other view                 -> `?view=<view>`
 *  - modal                          -> `&modal=<name>` (+ optional `&<key>=<value>`)
 */
export function serializeNav(node: NavNode): string {
  const params = new URLSearchParams();

  if (node.view === 'live' && node.auctionId) {
    // Reuse the existing deep-link param name so /?auction=<id> stays a single,
    // shareable convention across the app.
    params.set('auction', node.auctionId);
  } else if (node.view && node.view !== 'discovery') {
    params.set('view', node.view);
  }

  if (node.modal) {
    params.set('modal', node.modal);
    if (node.modalParam && node.modalParam.key) {
      params.set(node.modalParam.key, node.modalParam.value);
    }
  }

  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * Parse a search string back into a nav node.
 *
 * A Firebase auth-redirect callback (path under `/__/auth`, or a search carrying
 * an `apiKey` / `authType` param) is normalized to a neutral `{view:'discovery'}`
 * so the OAuth handoff is never routed as an app view.
 */
export function parseNav(search: string): NavNode {
  // Firebase auth callback guard — never route the OAuth handoff as a view.
  if (search.includes('/__/auth')) {
    return { view: 'discovery' };
  }

  const params = new URLSearchParams(search || '');

  if (params.has('apiKey') || params.has('authType')) {
    return { view: 'discovery' };
  }

  const auctionId = params.get('auction')?.trim();
  if (auctionId) {
    const node: NavNode = { view: 'live', auctionId };
    applyModal(node, params);
    return node;
  }

  const rawView = params.get('view')?.trim();
  const view: NavView =
    rawView && (KNOWN_VIEWS as readonly string[]).includes(rawView)
      ? (rawView as NavView)
      : 'discovery';

  const node: NavNode = { view };
  applyModal(node, params);
  return node;
}

function applyModal(node: NavNode, params: URLSearchParams): void {
  const modal = params.get('modal')?.trim();
  if (!modal) return;
  node.modal = modal;

  // Recover the single optional modal param: the first non-reserved key.
  for (const [key, value] of params.entries()) {
    if (!RESERVED_KEYS.has(key)) {
      node.modalParam = { key, value };
      break;
    }
  }
}
