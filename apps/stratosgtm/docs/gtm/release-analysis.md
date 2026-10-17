# Inside StratosGTM: what we built, how it works, and what is still rough

> **Published** at https://stratosgtm.vercel.app/analysis.html (source: `apps/web/public/analysis.html`, generated from this
> file). Written 2026-09-26 from the repository and live tests. Every number here comes from the code, the live app or a
> test we ran. Nothing here is a claim about customers or results, because there are none yet. If you edit this file,
> regenerate the page so the two do not drift.

StratosGTM is a voice agent for people who sell high-ticket offers. A visitor talks to it on your site, it qualifies them
and writes the lead into a CRM, and the same conversations feed a content pipeline that can publish. This is a full
account of how it works, including what we learned proving it live and the parts that are not built.

## 1. The problem we are aimed at

If you sell a program, a retainer or a service worth $2,000 or more, one extra qualified lead is worth real money. The
lead who visits at 11pm and finds nothing to talk to may not come back. Most tools that answer that are phone-first or
built for large support teams. We are building for the founder, creator or agency owner who wants the visitor
qualified while they sleep, and wants the conversation to feed what they publish next.

## 2. The system, end to end

A visitor's browser connects to a web console or an embeddable widget. The server checks consent, gating and usage, then
mints a short-lived token for AssemblyAI's Voice Agent API. The browser then streams audio straight to AssemblyAI; our
server never carries the audio and the browser never sees the real key. When the agent decides to act, AssemblyAI
sends a tool call to our server, which applies guardrails and writes to a Postgres CRM. Language work (chat, content,
Buyer Lab) goes to DeepSeek. Sign-in is Google through Neon Auth, and every account gets a private workspace.

The pieces: a React and Vite front end and an Express and TypeScript API, both on Vercel; Neon for Postgres and auth;
Stripe for billing (test mode); and a small self-hosted publishing server on Railway. A diagram with every part labeled
by how real it is lives at `docs/gtm/architecture.html`.

## 3. The voice loop and its seven tools

The agent registers seven tools with the voice API. We read them from the live app:

| Tool | What it does | Honest status |
|---|---|---|
| `create_or_update_lead` | Writes the lead to the CRM | Real |
| `qualify_lead` | Records budget, timeline and fit | Real |
| `enrich_prospect_dossier` | Builds a prospect dossier | Real when the language model is configured |
| `get_product_knowledge` | Answers product questions | A keyword lookup over four documents, not real retrieval |
| `schedule_growth_consultation` | Records a consultation request | Writes a confirmation code on the lead. It is not a calendar |
| `process_retention_offer` | Handles a churn-save conversation | Real, with a hard discount ceiling |
| `run_content_factory` | Starts the content pipeline | Real when configured |

Two things we insist on. First, **the model proposes and the application enforces**: the agent can ask for a discount,
but the server clamps it to a fixed ceiling, so the agent cannot give away margin. Second, **consent comes first**. The
server prepends an AI disclosure and asks for explicit opt-in in the 13 all-party-consent states (California,
Connecticut, Delaware, Florida, Illinois, Maryland, Massachusetts, Michigan, Montana, Nevada, New Hampshire,
Pennsylvania and Washington), with the strictest policy when the location is unknown. Consent records are append-only.
This is an engineering implementation, not legal advice.

What we have not measured: **time to first audio**. There is client-side measurement code, but no calls are recorded
yet, so we quote no speed figure at all.

## 4. From conversation to content

The content pipeline runs Research, Voice, Create, then Publish. It turns conversation topics into drafts for X,
LinkedIn and Substack. When the language model is not configured, it returns an honest placeholder flagged as a
fallback, never invented metrics or testimonials.

## 5. The publishing bridge, and why it is built this way

Publishing to many networks means one OAuth integration and one set of rules per network. Rather than build each, we
wrap an open-source project called TryPost and call it over HTTP. It is AGPL-licensed, so we run it as a separate
service, keep the source in a public fork, and only change its build and worker configuration.

The tenant model is simple. Each workspace saves its own TryPost token, encrypted with AES-256-GCM using a per-row data
key, and shown only as its last four characters. Before any post, the server checks that the chosen account belongs to
that workspace's own list of accounts. One workspace can never post through another's account.

Publishing is two calls, which we learned by testing. **Creating a post in TryPost always makes a draft**, even if you
send a schedule time. Publishing is a second call that sets the status to `publishing`. Then we read the status back.
The receipt says **published** only when TryPost itself reports it. Anything less reads **queued**, and every receipt
carries an `isSimulated` flag derived in exactly one place. We proved the whole path on 2026-09-26: text typed into the
app appeared on a Bluesky account.

## 6. What we learned proving it live

We tested the publishing path against a real network, and it taught us four things.

- **Success is not the same as published.** Our first publish call reported success and nothing posted, because the
  publishing service saves every new post as a draft and needs a second step to publish it. We now do both steps and
  read the status back, so a receipt says published only when the service confirms it.
- **Size the server for the networks you use.** The publishing service runs on a small server. We tuned it to run only
  the networks we use, so it stays inside its memory and handles posts promptly. We check capacity before switching
  another network on.
- **Approve changes where they take effect.** Sign-in failed on a new address because we had approved it in the wrong
  project. We now confirm each configuration change against the live system.
- **Say what is real.** Every claim on this page was checked against the code or a live test, and anything not built is
  listed below.

## 7. Buyer Lab, and why its claims are checkable

Buyer Lab runs simulated buyers over a page or offer. The rule that makes it usable: **every claim must carry a verbatim
quote found in the material that persona was shown**. Claims without one are dropped and counted, and the report cites
claim ids only. It never produces a probability, conversion or revenue figure. In one real-model check on a public site,
6 personas produced 45 kept claims and 3 dropped ones, and 6 model calls cost a few cents. These are hypotheses, not
measurements, and the tool says so.

## 8. What is not built

- Time to first audio is unmeasured, so no speed claim.
- No calendar booking.
- Product knowledge is four documents, not real retrieval.
- Only Bluesky auto-publishes. X and LinkedIn need credentials; Instagram, Facebook and others need their own app
  registration. YouTube is a labeled stub.
- Billing is in test mode.
- Sign-in uses shared development Google keys and should move to our own client before real customers.
- Widget calls are not metered.
- No duplicate protection on Publish yet.

## 9. What we want next

We are looking for three founders, creators or agencies selling offers of $2,000 and up to run a paid 30-day pilot.
You get setup help and a weekly review; we get honest feedback. If that is you, reply to the post that links here.
You can try the demo at stratosgtm.vercel.app. It is early, and it is rough in places.
