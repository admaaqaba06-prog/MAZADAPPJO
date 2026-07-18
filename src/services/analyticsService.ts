import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

export type AnalyticsEventType = 
  | 'user_registration'
  | 'auction_created'
  | 'bid_placed'
  | 'subscription_conversion'
  | 'rate_limit_triggered'
  | 'bid_spam_blocked'
  | 'membership_submitted'
  | 'first_bid'
  | 'auction_won_seen'
  | 'payment_submitted';

export interface AnalyticsEvent {
  id?: string;
  eventType: AnalyticsEventType;
  userId: string | null;
  userEmail: string | null;
  timestamp: number;
  metadata: Record<string, any>;
  clientIp?: string;
}

export const logAnalyticsEvent = async (
  eventType: AnalyticsEventType,
  userId: string | null,
  userEmail: string | null,
  metadata: Record<string, any> = {}
) => {
  try {
    const eventData: AnalyticsEvent = {
      eventType,
      userId,
      userEmail,
      timestamp: Date.now(),
      metadata,
    };

    // Print to dev console in a premium structured format
    console.log(
      `%c[ANALYTICS] %c${eventType.toUpperCase()} %c- User: ${userEmail || 'Anonymous'}`,
      'color: #FF6B00; font-weight: bold;',
      'color: #0088FF; font-weight: bold;',
      'color: #888888;',
      metadata
    );

    // Save directly to the live Firestore 'analytics_events' collection for full persistence
    const analyticsRef = collection(db, 'analytics_events');
    await addDoc(analyticsRef, eventData);
  } catch (err) {
    console.warn('[ANALYTICS ERROR] Failed to record event in Firestore:', err);
  }
};
