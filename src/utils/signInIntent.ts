/**
 * Why this visitor is being asked to sign in.
 *
 * `requestSignIn()` took no argument, so every entry point — a bid tap, a save,
 * the chat composer, the Sell FAB, the profile tab — produced the same screen,
 * and that screen's only contextual line said "Sign in to join the live
 * auction". A partner review caught it from the seller's side: tapping "Sell
 * your product" asked them to sign in to bid.
 *
 * The copy makes ONE promise: what happens next. No claims about being free,
 * instant, secure or verified — a sign-in screen is where those are most
 * tempting and least checkable, and a test in this module's spec forbids them.
 */
export type SignInIntent = 'bid' | 'sell' | 'save' | 'chat' | 'account';

export const SIGN_IN_INTENTS: readonly SignInIntent[] = ['bid', 'sell', 'save', 'chat', 'account'];

export interface SignInPrompt {
  headline: string;
  subline: string;
}

const COPY: Record<SignInIntent, { ar: SignInPrompt; en: SignInPrompt }> = {
  bid: {
    ar: { headline: 'سجّل دخولك للمزايدة', subline: 'بترجع على نفس القطعة بعد الدخول.' },
    en: { headline: 'Sign in to place your bid', subline: "You'll come back to this lot." },
  },
  sell: {
    ar: { headline: 'سجّل دخولك لعرض منتجك', subline: 'بنكمل تفاصيل المنتج بعد الدخول.' },
    en: { headline: 'Sign in to list your item', subline: "We'll pick up the listing where you left it." },
  },
  save: {
    ar: { headline: 'سجّل دخولك لحفظ القطعة', subline: 'بتلاقيها بالمحفوظات بعد الدخول.' },
    en: { headline: 'Sign in to save this lot', subline: "It'll be in your saved items." },
  },
  chat: {
    ar: { headline: 'سجّل دخولك للمشاركة بالمحادثة', subline: 'بترجع على نفس المزاد بعد الدخول.' },
    en: { headline: 'Sign in to join the chat', subline: "You'll come back to this auction." },
  },
  account: {
    ar: { headline: 'يا هلا فيك — سجّل دخولك', subline: 'حسابك، مزايداتك وطلباتك بمكان واحد.' },
    en: { headline: 'Welcome — sign in', subline: 'Your account, bids and orders in one place.' },
  },
};

export function signInPrompt(intent: SignInIntent | null | undefined, isAr: boolean): SignInPrompt {
  const entry = (intent && COPY[intent]) || COPY.account;
  return isAr ? entry.ar : entry.en;
}

/**
 * Where to land after a successful sign-in, or null to leave the latched view
 * alone.
 *
 * AppContext already latches `activeView`/`activeAuctionId` across signup, so a
 * bidder returns to the exact lot they were watching. Only `sell` names a
 * destination, because the Sell FAB is the one entry point whose view a guest
 * was never allowed to reach in the first place — so there is nothing latched
 * to return to.
 *
 * NOT restored: the staged bid amount. `useBidFlow.startBid` deliberately drops
 * it at every gate, because a stashed amount resumed on the WRONG auction
 * across concurrent flows (the reel view and the details overlay each hold
 * one). The confirm step also re-prompts whenever the minimum has moved, so a
 * resumed amount would frequently be stale anyway.
 */
export function postSignInView(intent: SignInIntent | null | undefined): string | null {
  return intent === 'sell' ? 'upload' : null;
}
