import { extractPage, decodeEntities } from '../../buyerlab/htmlText';
import { parseRobots, isAllowedByRobots } from '../../buyerlab/robots';
import { crawl, CrawlFetch } from '../../buyerlab/crawler';
import { UnsafeUrlError } from '../../buyerlab/ssrf';

const PAGE = `<!doctype html><html><head><title>Veloce &amp; Co</title><style>.x{color:red}</style>
<script>window.secret = "do not include";</script></head><body>
<!-- hidden comment --><nav><a href="/pricing">Pricing</a> <a href="https://other.com/x">Other</a> <a href="#top">Top</a></nav>
<h1>Replace six tools</h1><p>Pricing is by &ldquo;signed proposal&rdquo; only.</p>
<h2>How it works</h2><ul><li>One</li><li>Two</li></ul><noscript>enable js</noscript>
<a href="/docs/guide.pdf">PDF</a><a href="/about#team">About</a></body></html>`;


// ---------------------------------------------------------------------------
// referenceExtract: the ORIGINAL regex extractPage from the Task 5 brief, kept
// verbatim as the behavioural reference. It is fine on normal pages and
// quadratic on hostile ones, which is why extractPage no longer uses it.
// ---------------------------------------------------------------------------
const REF_BLOCK_TAGS = /<\/?(?:p|div|section|article|header|footer|main|nav|aside|ul|ol|li|h[1-6]|br|tr|table|blockquote|pre|form|fieldset|figure|figcaption|dl|dt|dd|hr)\b[^>]*>/gi;
const refStrip = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

function referenceExtract(html: string, baseUrl: string) {
  const title = refStrip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => refStrip(m[2])).filter(Boolean);
  const links: string[] = [];
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    try {
      const u = new URL(decodeEntities(m[1] ?? m[2] ?? ''), baseUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      u.hash = '';
      if (!links.includes(u.href)) links.push(u.href);
    } catch {
      /* ignore malformed href */
    }
  }
  const body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, '')
    .replace(REF_BLOCK_TAGS, '\n')
    .replace(/<[^>]*>/g, '');
  const text = decodeEntities(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title, headings, text, links };
}

const timed = (fn: () => unknown): number => {
  const t0 = Date.now();
  fn();
  return Date.now() - t0;
};

const FIXTURES: Record<string, string> = {
  brief_page: PAGE,
  nested_tags:
    '<html><head><title>Nested</title></head><body><div><section><p>Hello <b>bold <i>italic</i></b> world</p>' +
    '<ul><li><a href="/deep"><span>Deep</span> link</a></li><li>Second <em>item</em></li></ul></section></div>' +
    '<h2>Big <em>idea</em> here</h2><p>Tail</p></body></html>',
  gt_in_attributes:
    '<html><head><title>Attrs</title></head><body><a href="/gt" title="a>b">Label</a>' +
    '<div data-x="1>2" class="c">Content</div><a title="x>y" href="/lost">Lost</a><p>After</p></body></html>',
  uppercase_tags:
    '<HTML><HEAD><TITLE>Upper Case</TITLE></HEAD><BODY><H1>Loud Heading</H1><P>Text <A HREF="/UP">Up</A></P>' +
    '<SCRIPT>var a = 1 < 2;</SCRIPT><UL><LI>One</LI><LI>Two</LI></UL></BODY></HTML>',
  single_quotes:
    "<html><head><title>Quotes</title></head><body><p>Single</p><a href='/single'>S</a><a href = '/spaced' >T</a>" +
    "<a class='x' href='https://elsewhere.example/p?q=1#frag'>E</a></body></html>",
  comments:
    '<html><head><title>Comments</title></head><body>Before <!-- a <b>comment</b>\nspanning lines --> after' +
    '<p>Para</p><!-- another --><p>End</p></body></html>',
  script_with_lt:
    '<html><head><title>Script</title><script>if (a < b && c > d) { document.write("<p>x</p>"); }</script></head>' +
    '<body><p>Visible</p><script type="text/javascript">for (var i = 0; i < 3; i++) { x = "<"; }</script><p>Also visible</p>' +
    '<style>p > a { color: red; } /* < */</style></body></html>',
  adjacent_headings: '<html><head><title>H</title></head><body><h2>A</h2><h2>A</h2><h3>B</h3><h1>Top</h1>after</body></html>',
  svg_with_title:
    '<html><head><title>Real Page Title</title></head><body><h1>Heading</h1>' +
    '<svg width="10" height="10"><title>Icon title</title><path d="M0 0L10 10"/></svg><p>Body text after icon</p></body></html>',
  heading_then_text: '<h1>Title</h1>after',
  skipped_elements:
    '<html><head><title>Skip</title><meta charset="utf-8"><link rel="stylesheet" href="/a.css"></head><body>' +
    '<template><p>tpl</p></template><iframe src="/f">fallback</iframe><noscript>no js here</noscript><p>Real</p></body></html>',
  entities: '<p>Fish &amp; Chips &lt;b&gt; &#65; &#x42; &nbsp;x &mdash; &copy; &unknown; &ldquo;q&rdquo;</p>',
  table_cells: '<html><body><table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table></body></html>',
  link_kinds:
    '<body><a href="mailto:x@y.z">m</a><a href="javascript:void(0)">j</a><a href="/a#1">1</a><a href="/a#2">2</a>' +
    '<a href="../up">u</a><a href="tel:123">t</a><a href="">self</a></body>',
  header_is_not_head:
    '<html><head><title>Hdr</title></head><body><header><h1>Site</h1><nav><a href="/n">N</a></nav></header>' +
    '<main><p>Main text</p></main><footer>Foot &copy; 2026</footer></body></html>',
  multiline_title: '<html><head><title>\n  Multi\n  Line  &amp; more </title></head><body><p>x</p></body></html>',
  breaks: '<p>Line one<br>Line two<br/>Line three<hr>Line four</p>',
  attr_link_noise:
    '<body><a class="btn" data-track="1" href="/with-attrs" rel="nofollow">Go</a><a\nhref="/newline">NL</a></body>'
};

const HOSTILE_INPUT_BUDGET_MS = 2000; // catches quadratic blowups (measured 10-27 s); 500 ms flaked under parallel full-suite load

describe('extractPage', () => {
  const r = extractPage(PAGE, 'https://veloceos.cloud/');
  it('reads title and headings', () => {
    expect(r.title).toBe('Veloce & Co');
    expect(r.headings).toEqual(['Replace six tools', 'How it works']);
  });
  it('keeps visible text and drops script, style, comments and noscript', () => {
    expect(r.text).toContain('Replace six tools');
    expect(r.text).toContain('Pricing is by \u201Csigned proposal\u201D only.');
    expect(r.text).not.toMatch(/secret|color:red|hidden comment|enable js/);
  });
  it('puts block elements on separate lines', () => {
    expect(r.text.split('\n')).toEqual(expect.arrayContaining(['One', 'Two']));
  });
  it('returns absolute, de-duplicated, hash-free http(s) links', () => {
    expect(r.links).toEqual([
      'https://veloceos.cloud/pricing',
      'https://other.com/x',
      'https://veloceos.cloud/',
      'https://veloceos.cloud/docs/guide.pdf',
      'https://veloceos.cloud/about'
    ]);
  });

  // Hostile input tests: all must complete within the budget
  it('handles many unclosed tags linearly', () => {
    const start = Date.now();
    const result = extractPage('<script>'.repeat(50000), 'https://example.com/');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(HOSTILE_INPUT_BUDGET_MS);
    expect(result.text.length).toBeLessThan(10); // mostly empty
  });

  it('handles many angle brackets without backtracking', () => {
    const start = Date.now();
    const result = extractPage('<'.repeat(200000), 'https://example.com/');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(HOSTILE_INPUT_BUDGET_MS);
    expect(result.text.length).toBeLessThan(10);
  });

  it('handles many link tags without quadratic dedup', () => {
    const start = Date.now();
    const links = Array.from({ length: 60000 }, (_, i) => `<a href="/p${i}">link</a>`).join('');
    const result = extractPage(`<html><body>${links}</body></html>`, 'https://example.com/');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(HOSTILE_INPUT_BUDGET_MS);
    // Links capped at 500
    expect(result.links.length).toBeLessThanOrEqual(500);
  });

  it('caps links at 500 and headings at 100', () => {
    const links = Array.from({ length: 600 }, (_, i) => `<a href="/p${i}">link</a>`).join('');
    const headings = Array.from({ length: 150 }, (_, i) => `<h1>H${i}</h1>`).join('');
    const result = extractPage(`<html><body>${headings}${links}</body></html>`, 'https://example.com/');
    expect(result.links.length).toBeLessThanOrEqual(500);
    expect(result.headings.length).toBeLessThanOrEqual(100);
  });

  it('decodes bad numeric entity &#x110000; to replacement character', () => {
    const result = extractPage('<p>test &#x110000; end</p>', 'https://example.com/');
    expect(result.text).toContain('\uFFFD');
  });

  it('decodes bad numeric entity &#99999999999; to replacement character', () => {
    const result = extractPage('<p>test &#99999999999; end</p>', 'https://example.com/');
    expect(result.text).toContain('\uFFFD');
  });

  it('decodes surrogate entity &#xD800; to replacement character', () => {
    const result = extractPage('<p>test &#xD800; end</p>', 'https://example.com/');
    expect(result.text).toContain('\uFFFD');
  });

  it('decodes valid entity &#65; correctly', () => {
    const result = extractPage('<p>test &#65; end</p>', 'https://example.com/');
    expect(result.text).toContain('A');
  });

  describe('is linear on hostile input (each within budget)', () => {
    it('200,000 unclosed <h1> tags', () => {
      expect(timed(() => extractPage('<h1>'.repeat(200000), 'https://example.com/'))).toBeLessThan(HOSTILE_INPUT_BUDGET_MS);
    });
    it('100,000 unclosed <title> tags', () => {
      expect(timed(() => extractPage('<title>'.repeat(100000), 'https://example.com/'))).toBeLessThan(HOSTILE_INPUT_BUDGET_MS);
    });
    it('50,000 open <h1> tags then one close tag', () => {
      let r: ReturnType<typeof extractPage> | undefined;
      expect(timed(() => { r = extractPage('<h1>'.repeat(50000) + '</h1>', 'https://example.com/'); })).toBeLessThan(HOSTILE_INPUT_BUDGET_MS);
      expect(r?.headings).toEqual([]);
    });
    it('many unclosed comments, tags and attribute-less anchors', () => {
      expect(timed(() => extractPage('<!--'.repeat(100000), 'https://example.com/'))).toBeLessThan(HOSTILE_INPUT_BUDGET_MS);
      expect(timed(() => extractPage('<a href="'.repeat(100000), 'https://example.com/'))).toBeLessThan(HOSTILE_INPUT_BUDGET_MS);
      expect(timed(() => extractPage('<a '.repeat(200000) + '>', 'https://example.com/'))).toBeLessThan(HOSTILE_INPUT_BUDGET_MS);
    });
  });

  describe('matches the brief regex extractor on realistic pages', () => {
    it.each(Object.keys(FIXTURES))('fixture %s', (name) => {
      const got = extractPage(FIXTURES[name], 'https://veloceos.cloud/base/');
      const want = referenceExtract(FIXTURES[name], 'https://veloceos.cloud/base/');
      expect(got.title).toEqual(want.title);
      expect(got.headings).toEqual(want.headings);
      expect(got.text).toEqual(want.text);
      expect(got.links).toEqual(want.links);
    });
    it('has at least ten fixtures', () => {
      expect(Object.keys(FIXTURES).length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('required behaviour', () => {
    const base = 'https://example.com/';
    it('closing block tags also break lines, and h1-h6 are block tags', () => {
      expect(extractPage('<h1>Title</h1>after', base).text.split('\n')).toEqual(['Title', 'after']);
      expect(extractPage('<h2>A</h2><h2>A</h2>', base).text.split('\n')).toEqual(['A', 'A']);
      expect(extractPage('<h5>Five</h5>tail', base).text.split('\n')).toEqual(['Five', 'tail']);
    });
    it('keeps head, svg, template, iframe, noscript, script and style out of the visible text', () => {
      const r = extractPage(FIXTURES.skipped_elements, base);
      expect(r.title).toBe('Skip');
      expect(r.text).toBe('Real');
      const p = extractPage(PAGE, base);
      expect(p.text).not.toContain('Veloce & Co');
    });
    it('takes the FIRST title; a later svg <title> never overrides it', () => {
      const r = extractPage(FIXTURES.svg_with_title, base);
      expect(r.title).toBe('Real Page Title');
      expect(r.text).not.toContain('Icon title');
      expect(r.text).toContain('Body text after icon');
    });
    it('does not treat <header> as <head>', () => {
      expect(extractPage(FIXTURES.header_is_not_head, base).text).toContain('Site');
    });
    it('restarts an unfinished heading when a new one opens, and ignores an unclosed one at the end', () => {
      expect(extractPage('<h1>lost<h2>kept</h2>', base).headings).toEqual(['kept']);
      expect(extractPage('<h2>done</h2><h1>never closed', base).headings).toEqual(['done']);
    });
    it('caps a captured heading and title at 300 characters', () => {
      const long300 = 'x'.repeat(1000);
      const r = extractPage(`<title>${long300}</title><h1>${long300}</h1>`, base);
      expect(r.title.length).toBe(300);
      expect(r.headings[0].length).toBe(300);
    });
    it('deliberate difference: an unclosed script or style drops the rest of the document', () => {
      expect(extractPage('<p>Visible</p><script>var x = 1;<p>Hidden</p>', base).text).toBe('Visible');
      expect(extractPage('<p>Visible</p><style>p{}<p>Hidden</p>', base).text).toBe('Visible');
    });
  });
});

describe('robots', () => {
  const txt = 'User-agent: *\nDisallow: /private\nAllow: /private/open\n\nUser-agent: stratosgtm-buyerlab\nDisallow: /blocked\n';
  it('uses the group for our agent when one exists', () => {
    const rules = parseRobots(txt, 'StratosGTM-BuyerLab');
    expect(isAllowedByRobots(rules, '/blocked/x')).toBe(false);
    expect(isAllowedByRobots(rules, '/private')).toBe(true);
  });
  it('falls back to * and lets the longest match win', () => {
    const rules = parseRobots(txt, 'someone-else');
    expect(isAllowedByRobots(rules, '/private/secret')).toBe(false);
    expect(isAllowedByRobots(rules, '/private/open/page')).toBe(true);
    expect(isAllowedByRobots(rules, '/public')).toBe(true);
  });
  it('treats an empty Disallow as allow-all', () => {
    expect(isAllowedByRobots(parseRobots('User-agent: *\nDisallow:\n'), '/anything')).toBe(true);
  });
});

const html = (body: string, links: string[] = []) => `<html><head><title>T</title></head><body><p>${body}</p>${links.map((l) => `<a href="${l}">l</a>`).join('')}</body></html>`;
const long = 'Buyer facing copy that is long enough to count as real page content. '.repeat(6);

function fakeFetch(map: Record<string, { status?: number; body?: string }>, log: string[] = []): CrawlFetch {
  return async (url) => {
    log.push(url);
    const hit = map[url];
    if (!hit) return { finalUrl: url, status: 404, contentType: 'text/html', body: '', truncated: false };
    return { finalUrl: url, status: hit.status ?? 200, contentType: 'text/html', body: hit.body ?? '', truncated: false };
  };
}

describe('crawl', () => {
  it('crawls same-origin pages breadth-first and skips other origins and files', async () => {
    const log: string[] = [];
    const fetch = fakeFetch({
      'https://a.com/': { body: html(long, ['/one', '/two', 'https://b.com/x', '/file.pdf']) },
      'https://a.com/one': { body: html(long + ' one') },
      'https://a.com/two': { body: html(long + ' two') }
    }, log);
    const r = await crawl('https://a.com/', {}, { fetch });
    expect(r.pages.map((p) => p.url)).toEqual(['https://a.com/', 'https://a.com/one', 'https://a.com/two']);
    expect(log).not.toContain('https://b.com/x');
    expect(log).not.toContain('https://a.com/file.pdf');
  });

  it('stops at maxPages and reports truncation', async () => {
    const map: Record<string, { body: string }> = { 'https://a.com/': { body: html(long, ['/1', '/2', '/3', '/4']) } };
    for (const n of [1, 2, 3, 4]) map[`https://a.com/${n}`] = { body: html(long + n) };
    const r = await crawl('https://a.com/', { maxPages: 3 }, { fetch: fakeFetch(map) });
    expect(r.pages).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });

  it('respects robots.txt', async () => {
    const fetch = fakeFetch({
      'https://a.com/robots.txt': { body: 'User-agent: *\nDisallow: /private\n' },
      'https://a.com/': { body: html(long, ['/private/x', '/ok']) },
      'https://a.com/ok': { body: html(long + ' ok') }
    });
    const r = await crawl('https://a.com/', {}, { fetch });
    expect(r.pages.map((p) => p.url)).toEqual(['https://a.com/', 'https://a.com/ok']);
    expect(r.skipped).toContainEqual({ url: 'https://a.com/private/x', reason: 'robots' });
  });

  it('stops when the deadline passes', async () => {
    let t = 0;
    const inner = fakeFetch({ 'https://a.com/': { body: html(long, ['/1']) }, 'https://a.com/1': { body: html(long + ' one') } });
    // robots.txt is free; every page costs 150 ms against a 100 ms deadline.
    const fetch: CrawlFetch = async (u, o) => {
      if (!u.endsWith('/robots.txt')) t += 150;
      return inner(u, o);
    };
    const r = await crawl('https://a.com/', { deadlineMs: 100 }, { fetch, now: () => t });
    expect(r.pages).toHaveLength(1);
    expect(r.truncated).toBe(true);
  });

  it('skips a link the guard refuses, but lets an unsafe START url throw', async () => {
    const guard: CrawlFetch = async (url) => {
      if (url.includes('169.254') || url.endsWith('/redir')) throw new UnsafeUrlError('no', 'private_address');
      return { finalUrl: url, status: 200, contentType: 'text/html', body: html(long, ['/redir']), truncated: false };
    };
    const r = await crawl('https://a.com/', {}, { fetch: guard });
    expect(r.pages).toHaveLength(1);
    expect(r.skipped).toContainEqual({ url: 'https://a.com/redir', reason: 'private_address' });
    await expect(crawl('http://169.254.169.254/', {}, { fetch: guard })).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('keeps thin pages out of the results but reports them', async () => {
    const r = await crawl('https://a.com/', {}, { fetch: fakeFetch({ 'https://a.com/': { body: '<html><body><div id="root"></div></body></html>' } }) });
    expect(r.pages).toHaveLength(0);
    expect(r.skipped).toContainEqual({ url: 'https://a.com/', reason: 'thin_content' });
  });

  it('respects deadline passed to every fetch and stops mid-crawl', async () => {
    let t = 0;
    const inner = fakeFetch({
      'https://a.com/': { body: html(long, ['/1', '/2', '/3']) },
      'https://a.com/1': { body: html(long + ' one') },
      'https://a.com/2': { body: html(long + ' two') }
    });
    const fetch: CrawlFetch = async (u, o) => {
      t += 100;
      if (o?.deadlineAt && t > o.deadlineAt) throw new Error('deadline exceeded');
      return inner(u, o);
    };
    const r = await crawl('https://a.com/', { deadlineMs: 250 }, { fetch, now: () => t });
    expect(r.pages.length).toBeLessThan(3);
    expect(r.truncated).toBe(true);
  });

  it('skips same-origin link that 302s to another host', async () => {
    let fetchCalls: string[] = [];
    const smartFetch: CrawlFetch = async (u) => {
      fetchCalls.push(u);
      if (u === 'https://a.com/') return { finalUrl: u, status: 200, contentType: 'text/html', body: html(long, ['/redir']), truncated: false };
      if (u === 'https://a.com/redir') return { finalUrl: 'https://b.com/landing', status: 200, contentType: 'text/html', body: html(long), truncated: false };
      return { finalUrl: u, status: 404, contentType: 'text/html', body: '', truncated: false };
    };
    const r = await crawl('https://a.com/', {}, { fetch: smartFetch });
    expect(r.pages.map((p) => p.url)).toEqual(['https://a.com/']);
    expect(r.skipped).toContainEqual({ url: 'https://a.com/redir', reason: 'cross_origin_redirect' });
  });

  it('handles apex to www redirect (origin changes but same-origin), fetches new robots.txt', async () => {
    const requests: string[] = [];
    const smartFetch: CrawlFetch = async (u) => {
      requests.push(u);
      // robots.txt for apex
      if (u === 'https://a.com/robots.txt') return { finalUrl: u, status: 200, contentType: 'text/plain', body: 'User-agent: *\nDisallow: /private\n', truncated: false };
      // robots.txt for www (no disallows)
      if (u === 'https://www.a.com/robots.txt') return { finalUrl: u, status: 200, contentType: 'text/plain', body: 'User-agent: *\n', truncated: false };
      // Start page redirects to www version
      if (u === 'https://a.com/') return { finalUrl: 'https://www.a.com/', status: 200, contentType: 'text/html', body: html(long, ['/page1', '/private']), truncated: false };
      // www pages
      if (u === 'https://www.a.com/page1') return { finalUrl: u, status: 200, contentType: 'text/html', body: html(long + ' page1'), truncated: false };
      if (u === 'https://www.a.com/private') return { finalUrl: u, status: 200, contentType: 'text/html', body: html(long + ' private'), truncated: false };
      return { finalUrl: u, status: 404, contentType: 'text/html', body: '', truncated: false };
    };
    const r = await crawl('https://a.com/', {}, { fetch: smartFetch });
    // Should have fetched robots.txt twice and ingested apex-redirected pages
    expect(requests.filter((u) => u.includes('robots')).length).toBeGreaterThanOrEqual(2);
    expect(r.pages.map((p) => p.url).sort()).toEqual(['https://www.a.com/', 'https://www.a.com/page1', 'https://www.a.com/private']);
  });

  it('deduplicates by finalUrl: two links that redirect to the same content yield one page', async () => {
    const smartFetch: CrawlFetch = async (u) => {
      if (u === 'https://a.com/') return { finalUrl: u, status: 200, contentType: 'text/html', body: html(long, ['/old', '/new']), truncated: false };
      if (u === 'https://a.com/old') return { finalUrl: 'https://a.com/new', status: 301, contentType: 'text/html', body: html(long), truncated: false };
      if (u === 'https://a.com/new') return { finalUrl: u, status: 200, contentType: 'text/html', body: html(long), truncated: false };
      return { finalUrl: u, status: 404, contentType: 'text/html', body: '', truncated: false };
    };
    const r = await crawl('https://a.com/', {}, { fetch: smartFetch });
    expect(r.pages).toHaveLength(2); // / and /new (not /old since it redirects)
    expect(r.pages.map((p) => p.url)).toEqual(['https://a.com/', 'https://a.com/new']);
  });

  describe('truncated and the attempts cap', () => {
    const pageCalls = (log: string[]) => log.filter((u) => !u.endsWith('/robots.txt'));

    it('counts every page fetch including 404s (not robots.txt): maxPages 3 allows exactly 9 page fetches', async () => {
      const dead = Array.from({ length: 40 }, (_, i) => `/dead${i}`);
      const log: string[] = [];
      const r = await crawl('https://a.com/', { maxPages: 3 }, { fetch: fakeFetch({ 'https://a.com/': { body: html(long, dead) } }, log) });
      expect(pageCalls(log)).toHaveLength(9);
      expect(log.filter((u) => u.endsWith('/robots.txt'))).toHaveLength(1);
      expect(r.pages.map((p) => p.url)).toEqual(['https://a.com/']);
      expect(r.truncated).toBe(true);
    });

    it('does not count robots-skipped URLs, which are never fetched', async () => {
      const blocked = Array.from({ length: 30 }, (_, i) => `/private/${i}`);
      const log: string[] = [];
      const fetch = fakeFetch({
        'https://a.com/robots.txt': { body: 'User-agent: *\nDisallow: /private\n' },
        'https://a.com/': { body: html(long, [...blocked, '/ok']) },
        'https://a.com/ok': { body: html(long + ' ok') }
      }, log);
      const r = await crawl('https://a.com/', { maxPages: 2 }, { fetch });
      expect(pageCalls(log)).toEqual(['https://a.com/', 'https://a.com/ok']);
      expect(r.pages.map((p) => p.url)).toEqual(['https://a.com/', 'https://a.com/ok']);
      expect(r.truncated).toBe(false);
    });

    it('a complete small site is not truncated even though it has fewer than maxPages pages', async () => {
      const fetch = fakeFetch({
        'https://a.com/': { body: html(long, ['/two']) },
        'https://a.com/two': { body: html(long + ' two') }
      });
      const r = await crawl('https://a.com/', {}, { fetch });
      expect(r.pages.map((p) => p.url)).toEqual(['https://a.com/', 'https://a.com/two']);
      expect(r.truncated).toBe(false);
    });

    it('is truncated when the deadline passes with URLs still queued, keeping only the pages fetched before it', async () => {
      let t = 0;
      const log: string[] = [];
      const inner = fakeFetch({
        'https://a.com/': { body: html(long, ['/1', '/2']) },
        'https://a.com/1': { body: html(long + ' one') },
        'https://a.com/2': { body: html(long + ' two') }
      }, log);
      const fetch: CrawlFetch = async (u, o) => {
        if (!u.endsWith('/robots.txt')) t += 150;
        return inner(u, o);
      };
      const r = await crawl('https://a.com/', { deadlineMs: 100 }, { fetch, now: () => t });
      expect(r.pages.map((p) => p.url)).toEqual(['https://a.com/']);
      expect(pageCalls(log)).toEqual(['https://a.com/']);
      expect(r.truncated).toBe(true);
    });

    it('a crawl that ends exactly at maxPages with an empty queue is not truncated, even if the clock passed the deadline', async () => {
      let t = 0;
      const inner = fakeFetch({
        'https://a.com/': { body: html(long, ['/two']) },
        'https://a.com/two': { body: html(long + ' two') }
      });
      const fetch: CrawlFetch = async (u, o) => {
        if (!u.endsWith('/robots.txt')) t += 60;
        return inner(u, o);
      };
      const r = await crawl('https://a.com/', { maxPages: 2, deadlineMs: 100 }, { fetch, now: () => t });
      expect(r.pages.map((p) => p.url)).toEqual(['https://a.com/', 'https://a.com/two']);
      expect(r.truncated).toBe(false);
    });
  });

  describe('origin pin', () => {
    it('pins only after the very first fetch: a thin start page linking to an off-origin redirect ingests and crawls nothing foreign', async () => {
      const log: string[] = [];
      const fetch: CrawlFetch = async (u) => {
        log.push(u);
        if (u === 'https://a.com/') return { finalUrl: u, status: 200, contentType: 'text/html', body: '<html><body><p>tiny</p><a href="/redir">go</a></body></html>', truncated: false };
        if (u === 'https://a.com/redir') return { finalUrl: 'https://b.com/landing', status: 200, contentType: 'text/html', body: html(long, ['/more']), truncated: false };
        return { finalUrl: u, status: 404, contentType: 'text/html', body: '', truncated: false };
      };
      const r = await crawl('https://a.com/', {}, { fetch });
      expect(log.filter((u) => u.includes('b.com'))).toEqual([]);
      expect(r.pages).toEqual([]);
      expect(r.skipped).toContainEqual({ url: 'https://a.com/', reason: 'thin_content' });
      expect(r.skipped).toContainEqual({ url: 'https://a.com/redir', reason: 'cross_origin_redirect' });
    });

    it('still follows an apex to www redirect of the start URL', async () => {
      const log: string[] = [];
      const fetch: CrawlFetch = async (u) => {
        log.push(u);
        if (u === 'https://a.com/') return { finalUrl: 'https://www.a.com/', status: 200, contentType: 'text/html', body: html(long, ['/p']), truncated: false };
        if (u === 'https://www.a.com/p') return { finalUrl: u, status: 200, contentType: 'text/html', body: html(long + ' p'), truncated: false };
        return { finalUrl: u, status: 404, contentType: 'text/html', body: '', truncated: false };
      };
      const r = await crawl('https://a.com/', {}, { fetch });
      expect(r.pages.map((p) => p.url)).toEqual(['https://www.a.com/', 'https://www.a.com/p']);
      expect(log).toContain('https://www.a.com/robots.txt');
    });
  });

  it('remembers a redirect target so a later link to it costs no second fetch', async () => {
    const log: string[] = [];
    const fetch: CrawlFetch = async (u) => {
      log.push(u);
      if (u === 'https://a.com/') return { finalUrl: u, status: 200, contentType: 'text/html', body: html(long, ['/old']), truncated: false };
      if (u === 'https://a.com/old') return { finalUrl: 'https://a.com/new', status: 200, contentType: 'text/html', body: html(long + ' moved', ['/new']), truncated: false };
      return { finalUrl: u, status: 404, contentType: 'text/html', body: '', truncated: false };
    };
    const r = await crawl('https://a.com/', {}, { fetch });
    expect(log.filter((u) => !u.endsWith('/robots.txt'))).toEqual(['https://a.com/', 'https://a.com/old']);
    expect(r.pages.map((p) => p.url)).toEqual(['https://a.com/', 'https://a.com/new']);
  });
});

describe('decodeEntities: NUL', () => {
  it('maps numeric references to code point 0 to U+FFFD', () => {
    expect(decodeEntities('a&#0;b&#x0;c&#x00;d&#000;e')).toBe('a\uFFFDb\uFFFDc\uFFFDd\uFFFDe');
  });
  it('never lets a NUL reach extracted page text', () => {
    const html = '<html><body><p>Hello &#0; world &#x0; here, enough words to be a real paragraph of copy for the buyer.</p></body></html>';
    expect(extractPage(html, 'https://a.com/').text).not.toContain('\u0000');
  });
});
