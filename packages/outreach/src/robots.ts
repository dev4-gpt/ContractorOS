/**
 * A small robots.txt reader. It follows the usual rules: the most specific matching group wins, the longest matching
 * pattern wins, and Allow beats Disallow when they tie. `*` matches anything and a trailing `$` anchors the end.
 */
export interface RobotsRules {
  allows(path: string): boolean;
  /** Seconds the site asks crawlers to wait between requests, if it says so. */
  crawlDelay?: number;
}

interface Rule {
  allow: boolean;
  pattern: string;
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

export function parseRobots(text: string, agentToken: string): RobotsRules {
  const token = agentToken.toLowerCase();
  const groups: { agents: string[]; rules: Rule[]; delay?: number }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      if (value) current.rules.push({ allow: field === 'allow', pattern: value });
    } else if (field === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.delay = n;
    }
  }

  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules);
  const delay = chosen.find((g) => g.delay !== undefined)?.delay;

  return {
    crawlDelay: delay,
    allows(path: string): boolean {
      let best: { len: number; allow: boolean } | null = null;
      for (const r of rules) {
        if (toRegex(r.pattern).test(path)) {
          const len = r.pattern.length;
          if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
        }
      }
      return best ? best.allow : true;
    }
  };
}

export const ALLOW_ALL: RobotsRules = { allows: () => true };
export const DISALLOW_ALL: RobotsRules = { allows: () => false };
