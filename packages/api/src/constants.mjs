// Hand written constants shared by every connector in this repo.

/** The public demo key. It reads only the fictional Kalvenor sample account. */
export const DEMO_KEY = 'bwp_demo_kalvenor_sample';

/** Account id of the fictional Kalvenor sample data. */
export const SAMPLE_ACCOUNT = 'sample';

/** Engine labels, exactly as the product names them. */
export const ENGINES = Object.freeze({
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  perplexity: 'Perplexity',
  google_aio: 'Google AI Overviews',
  google_ai_mode: 'Google AI Mode',
});

/** Webhook event types. webhook.test is sent by Send test event in the account. */
export const EVENT_TYPES = Object.freeze([
  'run.completed',
  'alert.fired',
  'fix.updated',
  'proof.updated',
  'webhook.test',
]);

/** Receivers reject a signature timestamp further than this from their clock. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Webhook header names. */
export const WEBHOOK_HEADERS = Object.freeze({
  signature: 'Broadcastwell-Signature',
  event: 'Broadcastwell-Event',
  eventId: 'Broadcastwell-Event-Id',
  delivery: 'Broadcastwell-Delivery',
});
