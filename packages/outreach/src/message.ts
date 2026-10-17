import type { Offer, Prospect, Sender } from './types.js';

export class MessageError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Cannot write the message: ${problems.join('; ')}`);
    this.name = 'MessageError';
  }
}

export interface Outreach {
  subject: string;
  body: string;
}

const MAX_BODY = 1600;

/**
 * Writes a plain, identified, one-time message. It will not produce output unless the sender is fully identified,
 * a postal address and an opt-out route are present, and the hosting price is stated. It never imitates a customer
 * enquiry and never claims to have audited the recipient's site.
 */
export function composeOutreach(args: { prospect: Prospect; sender: Sender; offer: Offer; previewUrl: string }): Outreach {
  const { prospect, sender, offer, previewUrl } = args;
  const problems: string[] = [];
  if (!sender.name.trim()) problems.push('sender name is required');
  if (!sender.email.trim()) problems.push('sender email is required');
  if (!sender.postalAddress.trim()) problems.push('sender postal address is required');
  if (!offer.hostingPrice.trim()) problems.push('the hosting price must be stated');
  if (!/^https:\/\/[^\s]+$/.test(previewUrl)) problems.push('the preview link must be a public https URL');
  const PLACEHOLDER = /your (name|business|city)|\(optional\)/i;
  const filled = [sender.name, sender.business ?? '', sender.postalAddress, sender.email, sender.optOutEmail ?? ''];
  if (filled.some((v) => PLACEHOLDER.test(v))) {
    problems.push('config.json still contains placeholder text from config.example.json');
  }
  if (problems.length) throw new MessageError(problems);

  const optOut = (sender.optOutEmail ?? sender.email).trim();
  const who = sender.business ? `${sender.name} (${sender.business})` : sender.name;
  const contact = [sender.email, sender.phone].filter(Boolean).join(' | ');

  const body = [
    'Hello,',
    '',
    `My name is ${who}. I build websites for local businesses. I made a concept of what a refreshed site for ${prospect.name} could look like, using only the details you have published publicly.`,
    '',
    `You can see it here: ${previewUrl}`,
    '',
    "It is a concept only. It is not live on your domain, it does not collect enquiries, and search engines are told not to list it. There is no charge for the concept and no obligation.",
    '',
    `If you would like it set up on your own domain, hosting would cost ${offer.hostingPrice.trim()}.`,
    '',
    `This is a one-time message. If you would rather not hear from me, reply "no thanks" or email ${optOut} and I will not contact you again. If you would like the concept taken down, say so and I will remove it.`,
    '',
    sender.name,
    sender.business ?? '',
    sender.postalAddress,
    contact
  ]
    .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n')
    .trim();

  if (body.length > MAX_BODY) throw new MessageError([`message is longer than ${MAX_BODY} characters`]);
  return { subject: `A website concept I made for ${prospect.name}`, body };
}
