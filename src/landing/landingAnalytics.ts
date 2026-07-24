// Client-side seller-funnel analytics for the public landing page.
// The landing page is served to UNAUTHENTICATED visitors, who cannot write
// to Firestore `analytics_events` (rule requires isSignedIn()). So these
// events are emitted client-side only: to the console (dev visibility) and
// to window.dataLayer (ready for a future GA/Segment/GTM wiring). This is
// intentionally NOT wired to analyticsService.logAnalyticsEvent.

export type LandingEventName =
  | 'landing_viewed'
  | 'seller_cta_clicked'
  | 'browse_cta_clicked'
  | 'auction_viewed'
  | 'category_selected'
  | 'language_switched'
  | 'seller_form_started'
  | 'seller_form_submitted';

export interface LandingEventPayload {
  event: LandingEventName;
  params: Record<string, string | number | boolean>;
  ts: number;
}

export function buildLandingEvent(
  event: LandingEventName,
  params: Record<string, string | number | boolean> = {},
  now: number = Date.now()
): LandingEventPayload {
  return { event, params, ts: now };
}

export function emitLandingEvent(
  event: LandingEventName,
  params: Record<string, string | number | boolean> = {}
): void {
  const payload = buildLandingEvent(event, params);
  try {
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (Array.isArray(w.dataLayer)) {
        w.dataLayer.push(payload);
      }
      if ((import.meta as any).env?.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[landing]', payload.event, payload.params);
      }
    }
  } catch {
    // analytics must never break the page
  }
}
