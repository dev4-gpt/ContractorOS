export interface RobotsRule {
  allow: boolean;
  path: string;
}

/** Prefix rules only (no * or $ wildcards). Our agent's group wins over `*`. */
export function parseRobots(text: string, agent = 'stratosgtm-buyerlab'): RobotsRule[] {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    } else {
      lastWasAgent = false;
    }
  }

  const me = agent.toLowerCase();
  const own = groups.find((g) => g.agents.some((a) => a !== '*' && me.includes(a)));
  const star = groups.find((g) => g.agents.includes('*'));
  return (own ?? star)?.rules ?? [];
}

export function isAllowedByRobots(rules: RobotsRule[], pathname: string): boolean {
  let best: RobotsRule | null = null;
  for (const r of rules) {
    if (!pathname.startsWith(r.path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}
