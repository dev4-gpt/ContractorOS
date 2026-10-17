import type { Citation, ResearchProvider } from "@reforge/factory";
import { PoliteFetcher } from "./safeFetch.js";
import { pageText, pickEvidence } from "./text.js";

export interface WebResearchOptions {
  /** The pages to read, or a function that finds them for a question (a search adapter plugs in here). */
  urls: readonly string[] | ((query: string) => Promise<readonly string[]>);
  fetcher?: PoliteFetcher;
  /** Most pages to read per question. Default 5. */
  maxSources?: number;
  /** Evidence kept per page, in characters. Default 3000. */
  maxEvidenceChars?: number;
  /** Called for every page that could not be used, so a gap is visible instead of silently ignored. */
  onError?: (url: string, error: Error) => void;
  now?: () => Date;
}

/**
 * ResearchProvider that reads real web pages. Each page becomes one citation whose evidence is the page's opening
 * plus the passages that best match the question. Pages that are blocked, missing or empty are skipped and reported.
 * It never invents a source: with no usable page it returns an empty list.
 */
export class WebResearch implements ResearchProvider {
  private readonly fetcher: PoliteFetcher;

  constructor(private readonly options: WebResearchOptions) {
    this.fetcher = options.fetcher ?? new PoliteFetcher();
  }

  async research(query: string): Promise<Array<Omit<Citation, "id">>> {
    const urls = typeof this.options.urls === "function" ? await this.options.urls(query) : this.options.urls;
    const out: Array<Omit<Citation, "id">> = [];
    for (const url of urls.slice(0, this.options.maxSources ?? 5)) {
      try {
        const page = await this.fetcher.fetchPage(url);
        const { title, text } = pageText(page.body, page.contentType);
        const evidence = pickEvidence(text, query, { maxChars: this.options.maxEvidenceChars ?? 3000 });
        if (!evidence) throw new Error("the page had no readable text");
        out.push({
          url: page.finalUrl,
          title: title ?? new URL(page.finalUrl).hostname,
          retrievedAt: (this.options.now?.() ?? new Date()).toISOString(),
          evidence,
        });
      } catch (error) {
        this.options.onError?.(url, error instanceof Error ? error : new Error(String(error)));
      }
    }
    return out;
  }
}
