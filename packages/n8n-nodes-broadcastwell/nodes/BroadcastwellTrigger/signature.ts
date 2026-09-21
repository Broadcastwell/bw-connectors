import { createHmac, timingSafeEqual } from 'crypto';

import { SIGNATURE_TOLERANCE_SECONDS } from '../shared/broadcastwell.generated';

// Same rules as verifyWebhookSignature in @broadcastwell/api. That helper uses WebCrypto
// through globalThis, which n8n community nodes may not reference, so the node uses the
// crypto module that n8n allows.

export interface SignatureCheck {
	valid: boolean;
	reason?:
		| 'missing_secret'
		| 'missing_header'
		| 'malformed_header'
		| 'stale_timestamp'
		| 'signature_mismatch';
	timestamp?: number;
}

/** Parse "t=<unix seconds>,v1=<hex>[,v1=<hex>]". */
export function parseSignatureHeader(header: string | undefined): { t: number; v1: string[] } | null {
	if (!header) return null;
	let t = Number.NaN;
	const v1: string[] = [];
	for (const part of header.split(',')) {
		const i = part.indexOf('=');
		if (i < 0) continue;
		const key = part.slice(0, i).trim();
		const value = part.slice(i + 1).trim();
		if (key === 't') t = /^\d+$/.test(value) ? Number(value) : Number.NaN;
		else if (key === 'v1' && /^[0-9a-fA-F]{64}$/.test(value)) v1.push(value.toLowerCase());
	}
	if (!Number.isFinite(t) || v1.length === 0) return null;
	return { t, v1 };
}

/** Hex HMAC SHA-256 of "<t>.<raw body>". */
export function computeSignature(secret: string, timestamp: number, rawBody: Buffer | string): string {
	return createHmac('sha256', secret)
		.update(`${timestamp}.`)
		.update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
		.digest('hex');
}

export function verifySignature(
	secret: string,
	header: string | undefined,
	rawBody: Buffer | string,
	nowSeconds: number,
	toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
): SignatureCheck {
	if (!secret) return { valid: false, reason: 'missing_secret' };
	if (!header) return { valid: false, reason: 'missing_header' };
	const parsed = parseSignatureHeader(header);
	if (!parsed) return { valid: false, reason: 'malformed_header' };
	if (Math.abs(nowSeconds - parsed.t) > toleranceSeconds) {
		return { valid: false, reason: 'stale_timestamp', timestamp: parsed.t };
	}
	const expected = Buffer.from(computeSignature(secret, parsed.t, rawBody), 'hex');
	const match = parsed.v1.some((candidate) => {
		const given = Buffer.from(candidate, 'hex');
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
	return match
		? { valid: true, timestamp: parsed.t }
		: { valid: false, reason: 'signature_mismatch', timestamp: parsed.t };
}
