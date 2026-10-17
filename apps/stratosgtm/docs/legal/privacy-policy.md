# StratosGTM Privacy Policy

> **DRAFT, not yet published, and not legal advice.** Have a lawyer review it before you rely on it. Items in
> [SQUARE BRACKETS] are facts only the owner can supply. Everything else was checked against what the product does as of
> 2026-09-26 (repo commit `f0d7028`). If the product changes, update this file first.

**Last updated:** September 26, 2026  ·  **Operator:** Stratos growthOS, Malvern, Pennsylvania, United States  ·  **Contact:** veloce.researcher@gmail.com

## 1. What this covers

StratosGTM ("we", "us") provides a voice agent that talks with visitors on a customer's website, records the resulting
leads in a CRM, drafts content from those conversations, simulates buyer reactions to a page (Buyer Lab), and publishes
posts to connected accounts. This policy explains what information we handle for two groups of people:

- **Account holders**: people who sign in to StratosGTM to run their own workspace.
- **Visitors**: people who talk to an agent that an account holder has placed on their site. For visitors, the account
  holder decides why and how the information is used, and we act on their behalf.

## 2. Information we handle

**Account information.** When you sign in with Google, we receive your email address, name and profile picture from
Google through our sign-in provider. We use them only to identify your account.

**Workspace content you or your agent create.** This includes:
- Leads captured by the agent: name, email, phone number, company, how they found you, a qualification score, any
  consultation request, and free-form notes that may include what was said in the conversation.
- Consent records: a session identifier, the region, the disclosure that was shown, whether and when consent was given,
  and the visitor's browser user-agent string.
- Dossiers, brand-voice settings, content drafts and, for Buyer Lab, the page text you supply or that we fetch from a
  public page you point us to.
- Connection keys you save (for example a publishing token). These are stored encrypted, and only the last four
  characters are ever shown.

**Voice.** Audio is streamed from the visitor's browser directly to our voice provider. It does not pass through, and is
not stored on, our own servers. Text of the conversation may be saved in a lead's notes.

**Billing.** Payments are handled by Stripe. We store a Stripe customer identifier, your plan and your usage. We do not
receive or store card numbers.

**Usage and technical data.** We record how many voice minutes a workspace uses, call-quality measurements, and
standard server logs (such as time, address and error details) needed to run and secure the service.

**Cookies and browser storage.** We do not use advertising or analytics trackers, and our own code sets no cookies. Our
sign-in provider sets a session cookie so you stay signed in. The app stores one preference (saved dossier presets) in
your browser's local storage.

## 3. How we use it

To provide and secure the service; to authenticate you; to record consent as required by law; to meter usage and bill you;
to fix problems; and to comply with legal obligations. **We do not sell personal information, and we do not use it for
advertising.** We do not train our own models on your content. Our providers' terms govern what they do with data sent
to them (see section 4).

## 4. Who we share it with

We use these providers to run the service. Each receives only what it needs:

| Provider | Purpose | Data involved |
|---|---|---|
| Google | Sign-in | Your Google account details when you sign in |
| Neon | Database and sign-in service | Account and workspace data |
| Vercel | Hosting | Web traffic and application logs |
| AssemblyAI | Voice agent | Live audio and conversation text |
| DeepSeek | Language model | Text sent for chat, drafts and Buyer Lab |
| Stripe | Payments | Billing details you give Stripe |
| TryPost (hosted on Railway) | Publishing to connected networks | The post text and the account you choose |

We may also disclose information if the law requires it, or to protect the rights and safety of users and the service. If
we are involved in a merger or sale, information may transfer as part of it, and we will tell you first.

## 5. Google user data

Our use and transfer of information received from Google APIs adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the
Limited Use requirements. We request only the basic sign-in scopes (email, profile and openid). We use them only to sign
you in and identify your account. We do not sell them, share them for advertising, or use them for any other purpose.

## 6. Voice calls and consent

The agent tells visitors they are speaking with an AI and asks for explicit consent in the all-party-consent states, with
the strictest rule applied when the location is unknown. Consent records are kept as an append-only log. Account holders
are responsible for lawful use of the agent on their own sites, including notices, consent and recording rules that
apply to their visitors.

## 7. How long we keep it

We keep account and workspace information while your account is active. Consent records are kept for four years after the conversation so that consent can be shown later. When you ask us to delete your account, we delete your workspace
content within 30 days, except what we must keep by law. Backups are overwritten on a normal cycle.

## 8. Security

Connection keys are encrypted at rest with AES-256-GCM using per-record data keys, and traffic to and from the service
uses HTTPS. Each workspace can only see its own data. No system is perfectly secure, so we cannot guarantee absolute
security. Tell us right away if you think your account has been compromised.

## 9. Your choices and rights

You can ask us to access, correct, export or delete the personal information we hold about you by writing to
veloce.researcher@gmail.com. Depending on where you live, you may have further rights, for example under US state privacy laws (such as those in California, Colorado, Connecticut, Texas and Virginia). We
handle these requests from every user in the United States, wherever you live, and we neither sell personal
information nor use it for targeted advertising. If you are a visitor who spoke with an agent on a customer's site, please
contact that customer first, because they decide how your information is used. We will help them respond.

## 10. Children

The service is not meant for anyone under 18, and we do not knowingly collect information from children.

## 11. Where data is processed

The service is intended for use in the United States. Our providers process data in the United States and possibly other countries. By using the service you understand that
information may be transferred to and processed in those places.

## 12. Changes

We will post changes here and update the date above. If a change is significant, we will tell account holders by email
or in the app.

## 13. Contact

Stratos growthOS · veloce.researcher@gmail.com · Malvern, Pennsylvania, United States
