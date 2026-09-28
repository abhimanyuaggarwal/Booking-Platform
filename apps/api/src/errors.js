// The two kinds of failure a console action can report as a sentence rather than a 500.

/** A booking move the state machine or policy does not allow ("A completed booking cannot refund"). */
export class BookingRuleError extends Error {}

/** Razorpay or Meta said no. The message carries their reason and what to check. */
export class ProviderError extends Error {}
