import { createHash } from 'node:crypto';
import { domainOf, emailKey, phoneKey } from './identity.js';
import type { Prospect } from './types.js';

export class ValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid input: ${problems.join('; ')}`);
    this.name = 'ValidationError';
  }
}

const CONTROL = /[\u0000-\u001f\u007f]/;

function text(value: unknown, field: string, max: number, problems: string[], required = false): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) problems.push(`${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string') {
    problems.push(`${field} must be text`);
    return undefined;
  }
  const v = value.trim();
  if (!v) {
    if (required) problems.push(`${field} is required`);
    return undefined;
  }
  if (v.length > max) problems.push(`${field} is longer than ${max} characters`);
  if (CONTROL.test(v)) problems.push(`${field} contains control characters`);
  return v;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'business'
  );
}

/** Deterministic id: the same business always gets the same id. */
export function prospectId(name: string, website?: string, email?: string, phone?: string): string {
  const key = [name.toLowerCase(), website ? (domainOf(website) ?? '') : '', email?.toLowerCase() ?? '', phone ? (phoneKey(phone) ?? '') : ''].join('|');
  return `${slugify(name)}-${createHash('sha256').update(key).digest('hex').slice(0, 6)}`;
}

export function validateProspect(input: unknown): Prospect {
  const problems: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ValidationError(['a prospect must be a JSON object']);
  }
  const o = input as Record<string, unknown>;

  const name = text(o.name, 'name', 120, problems, true);
  const website = text(o.website, 'website', 200, problems);
  const email = text(o.email, 'email', 200, problems);
  const phone = text(o.phone, 'phone', 40, problems);
  const street = text(o.street, 'street', 160, problems);
  const city = text(o.city, 'city', 80, problems);
  const region = text(o.region, 'region', 60, problems);
  const zip = text(o.zip, 'zip', 20, problems);
  const industry = text(o.industry, 'industry', 80, problems);
  const sourceOfDetails = text(o.sourceOfDetails, 'sourceOfDetails', 300, problems, true);
  const accentColor = text(o.accentColor, 'accentColor', 7, problems);

  if (website && !domainOf(website)) problems.push('website is not a usable URL');
  if (website && /^[a-z][a-z0-9+.-]*:\/\//i.test(website) && !/^https?:\/\//i.test(website)) {
    problems.push('website must be http or https');
  }
  if (email && !emailKey(email)) problems.push('email is not a valid address');
  if (phone && !/^\+?[0-9 ().-]{7,40}$/.test(phone)) problems.push('phone may only contain digits, spaces, + ( ) . -');
  if (phone && phoneKey(phone) === null) problems.push('phone has too few digits');
  if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) problems.push('accentColor must look like #2563eb');
  if (!website && !email && !phone) problems.push('provide at least one of website, email or phone');

  let services: string[] | undefined;
  if (o.services !== undefined) {
    if (!Array.isArray(o.services)) {
      problems.push('services must be a list of text');
    } else {
      if (o.services.length > 8) problems.push('services may list at most 8 items');
      services = [];
      o.services.forEach((s, i) => {
        const v = text(s, `services[${i}]`, 80, problems, true);
        if (v) services!.push(v);
      });
    }
  }

  if (problems.length > 0 || !name || !sourceOfDetails) throw new ValidationError(problems);

  const prospect: Prospect = {
    id: prospectId(name, website, email, phone),
    name,
    sourceOfDetails
  };
  if (website) prospect.website = website;
  if (email) prospect.email = email;
  if (phone) prospect.phone = phone;
  if (street) prospect.street = street;
  if (city) prospect.city = city;
  if (region) prospect.region = region;
  if (zip) prospect.zip = zip;
  if (industry) prospect.industry = industry;
  if (services && services.length > 0) prospect.services = services;
  if (accentColor) prospect.accentColor = accentColor.toLowerCase();
  return prospect;
}
