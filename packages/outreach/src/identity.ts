import type { Prospect } from './types.js';

/** Lowercased host without a leading "www.", or null when the input is not a usable URL/host. */
export function domainOf(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

/** Last ten digits, so "+1 (555) 010-0000" and "555.010.0000" match. Null if too short to be a phone number. */
export function phoneKey(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
}

export function emailKey(input: string): string | null {
  const v = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** Every stable identity a prospect can be recognised by. Used for dedupe and the do-not-contact list. */
export function identitiesOf(p: Pick<Prospect, 'website' | 'email' | 'phone'>): string[] {
  const out: string[] = [];
  if (p.website) {
    const d = domainOf(p.website);
    if (d) out.push(`domain:${d}`);
  }
  if (p.email) {
    const e = emailKey(p.email);
    if (e) {
      out.push(`email:${e}`);
    }
  }
  if (p.phone) {
    const ph = phoneKey(p.phone);
    if (ph) out.push(`phone:${ph}`);
  }
  return out;
}

/** Turns a free-form CLI argument (domain, email, phone) into an identity string. */
export function identityFromInput(input: string): string | null {
  const email = emailKey(input);
  if (email) return `email:${email}`;
  if (/[a-z]/i.test(input)) {
    const d = domainOf(input);
    return d ? `domain:${d}` : null;
  }
  const ph = phoneKey(input);
  return ph ? `phone:${ph}` : null;
}
