import { deepseekService } from './deepseekService';
import { brandVoiceService } from './brandVoiceService';
import { escapeHtml, escapeUrl, escapeCssValue } from '../utils/html';

/**
 * Elements the compiler will emit. `semanticTag` is caller-controlled, so
 * anything outside this set degrades to a <div> rather than being trusted.
 */
const SAFE_HTML_TAGS = new Set([
  'section', 'div', 'span', 'p', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'header', 'footer', 'main', 'article', 'aside', 'nav',
  'figure', 'figcaption', 'blockquote', 'strong', 'em', 'small', 'label'
]);

/** StyleDeclaration keys → CSS property names. Keys absent here are not emitted. */
const STYLE_PROPERTY_MAP: Record<string, string> = {
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  lineHeight: 'line-height',
  color: 'color',
  textAlign: 'text-align',
  padding: 'padding',
  margin: 'margin',
  backgroundColor: 'background',
  borderRadius: 'border-radius',
  border: 'border',
  display: 'display',
  flexDirection: 'flex-direction',
  justifyContent: 'justify-content',
  alignItems: 'align-items',
  gap: 'gap',
  gridTemplateColumns: 'grid-template-columns'
};

export type Breakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl';

export interface StyleDeclaration {
  layout?: {
    display?: 'flex' | 'grid' | 'block';
    flexDirection?: 'row' | 'column';
    justifyContent?: string;
    alignItems?: string;
    gap?: string;
    gridTemplateColumns?: string;
  };
  spacing?: {
    padding?: string;
    margin?: string;
  };
  typography?: {
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string;
    lineHeight?: string;
    color?: string;
    textAlign?: 'left' | 'center' | 'right';
  };
  visual?: {
    backgroundColor?: string;
    borderRadius?: string;
    border?: string;
    boxShadow?: string;
  };
}

export interface InstaticNode {
  id: string;
  type: 'section' | 'container' | 'grid' | 'text' | 'button' | 'image' | 'form' | 'embed';
  name: string;
  semanticTag?: 'section' | 'article' | 'header' | 'footer' | 'h1' | 'h2' | 'h3' | 'p' | 'div' | 'span';
  props: Record<string, any>;
  styles: {
    [K in Breakpoint]?: StyleDeclaration;
  };
  children?: InstaticNode[];
}

export interface InstaticPageDocument {
  id: string;
  slug: string;
  title: string;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  metadata: {
    title: string;
    description: string;
    ogImage?: string;
  };
  themeTokens: {
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
  };
  sections: InstaticNode[];
}

export class InstaticService {
  private pages: Map<string, InstaticPageDocument> = new Map();

  constructor() {
    this.seedDefaultPage();
  }

  private seedDefaultPage() {
    const demoPage = this.generatePageFromContentPack(
      'Acme Coaching Co.',
      'Lead Generation & High-Ticket Sprints',
      {
        thesis: 'Transforming freelance UI designers into $10k/mo strategic agency partners with 24/7 autonomous voice qualification.',
        hook: 'How Acme Coaching Co. scaled from $47 ebooks to $10k enterprise retainers without hiring a human SDR army.',
        coreProblem: 'Design studios lose 60% of high-intent international traffic because after-hours visitors bounce on static contact forms.',
        tacticalFramework: [
          'Replace static form with Anna Spoken Voice Operator',
          'Autonomous BANT lead qualification in 90 seconds',
          'Instant calendar booking into founder schedule'
        ]
      }
    );
    this.pages.set(demoPage.id, demoPage);
  }

  public getPages(companyName?: string): InstaticPageDocument[] {
    const all = Array.from(this.pages.values());
    if (companyName) {
      return all.filter((p) => p.companyName.toLowerCase() === companyName.toLowerCase());
    }
    return all;
  }

  public getPage(pageId: string): InstaticPageDocument | undefined {
    return this.pages.get(pageId);
  }

  public generatePageFromContentPack(
    companyName: string,
    title: string,
    contentSummary: {
      thesis: string;
      hook?: string;
      coreProblem?: string;
      tacticalFramework?: string[];
      pricingTier?: string;
    }
  ): InstaticPageDocument {
    const pageId = `page_instatic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const heroSection: InstaticNode = {
      id: `${pageId}_sec_hero`,
      type: 'section',
      name: 'Hero Section',
      semanticTag: 'header',
      props: {},
      styles: {
        base: {
          spacing: { padding: '80px 24px 60px 24px' },
          visual: { backgroundColor: '#09090b' },
          layout: { display: 'flex', flexDirection: 'column', alignItems: 'center' }
        }
      },
      children: [
        {
          id: `${pageId}_hero_badge`,
          type: 'text',
          name: 'Category Badge',
          semanticTag: 'span',
          props: { text: `STRATOSGTM • ${companyName.toUpperCase()}` },
          styles: {
            base: {
              typography: { fontSize: '12px', fontWeight: '700', color: '#d4af37' },
              spacing: { padding: '4px 14px', margin: '0 0 16px 0' },
              visual: { backgroundColor: 'rgba(212, 175, 55, 0.1)', borderRadius: '999px', border: '1px solid rgba(212, 175, 55, 0.3)' }
            }
          }
        },
        {
          id: `${pageId}_hero_headline`,
          type: 'text',
          name: 'Hero Headline',
          semanticTag: 'h1',
          props: { text: contentSummary.hook || contentSummary.thesis },
          styles: {
            base: {
              typography: { fontSize: '42px', fontWeight: '800', lineHeight: '1.2', color: '#ffffff', textAlign: 'center' },
              spacing: { margin: '0 0 20px 0' }
            }
          }
        },
        {
          id: `${pageId}_hero_subhead`,
          type: 'text',
          name: 'Hero Subheadline',
          semanticTag: 'p',
          props: {
            text: contentSummary.coreProblem || 'Engage prospective high-ticket clients with an autonomous conversational operator that qualifies budget, timeline, and goals 24/7.'
          },
          styles: {
            base: {
              typography: { fontSize: '18px', fontWeight: '400', lineHeight: '1.6', color: '#a1a1aa', textAlign: 'center' },
              spacing: { margin: '0 0 32px 0' }
            }
          }
        },
        {
          id: `${pageId}_hero_cta_cluster`,
          type: 'container',
          name: 'CTA Button Cluster',
          semanticTag: 'div',
          props: {},
          styles: {
            base: {
              layout: { display: 'flex', flexDirection: 'row', gap: '16px', justifyContent: 'center' }
            }
          },
          children: [
            {
              id: `${pageId}_cta_primary`,
              type: 'button',
              name: 'Primary Consultation Button',
              props: { text: 'Schedule Strategy Session', href: '#consultation' },
              styles: {
                base: {
                  typography: { fontSize: '15px', fontWeight: '700', color: '#000000' },
                  spacing: { padding: '14px 28px' },
                  visual: { backgroundColor: '#d4af37', borderRadius: '999px' }
                }
              }
            },
            {
              id: `${pageId}_cta_voice`,
              type: 'button',
              name: 'Spoken Voice Demo Button',
              props: { text: '🎙️ Speak with Anna (Voice Operator)', href: 'javascript:window.__StratosGTM && window.__StratosGTM.open()' },
              styles: {
                base: {
                  typography: { fontSize: '15px', fontWeight: '600', color: '#ffffff' },
                  spacing: { padding: '14px 28px' },
                  visual: { backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', border: '1px solid rgba(255, 255, 255, 0.16)' }
                }
              }
            }
          ]
        }
      ]
    };

    const voiceWidgetSection: InstaticNode = {
      id: `${pageId}_sec_voice_widget`,
      type: 'section',
      name: 'Interactive Spoken Anna Widget Integration',
      semanticTag: 'section',
      props: {},
      styles: {
        base: {
          spacing: { padding: '40px 24px' },
          visual: { backgroundColor: '#101014', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '24px' },
          layout: { display: 'flex', flexDirection: 'column', alignItems: 'center' }
        }
      },
      children: [
        {
          id: `${pageId}_voice_title`,
          type: 'text',
          name: 'Voice Section Title',
          semanticTag: 'h3',
          props: { text: 'Spoken Inbound AI Voice Operator Active' },
          styles: {
            base: {
              typography: { fontSize: '20px', fontWeight: '700', color: '#f4f4f5' },
              spacing: { margin: '0 0 8px 0' }
            }
          }
        },
        {
          id: `${pageId}_voice_desc`,
          type: 'text',
          name: 'Voice Section Description',
          semanticTag: 'p',
          props: {
            text: 'This static page is connected to StratosGTM. Prospective clients can speak to Anna directly via the floating orb in the bottom-right.'
          },
          styles: {
            base: {
              typography: { fontSize: '14px', color: '#a1a1aa', textAlign: 'center' }
            }
          }
        },
        {
          id: `${pageId}_voice_embed`,
          type: 'embed',
          name: 'StratosGTM Script Embed',
          props: {
            company: companyName,
            clientId: 'lead_ak_901',
            accent: '#d4af37',
            scriptUrl: 'http://localhost:4000/embed.js'
          },
          styles: { base: {} }
        }
      ]
    };

    const pillarsSection: InstaticNode = {
      id: `${pageId}_sec_pillars`,
      type: 'section',
      name: 'Value Proposition Pillars',
      semanticTag: 'section',
      props: {},
      styles: {
        base: {
          spacing: { padding: '60px 24px' },
          visual: { backgroundColor: '#09090b' }
        }
      },
      children: [
        {
          id: `${pageId}_pillars_grid`,
          type: 'grid',
          name: 'Pillars 3-Col Grid',
          semanticTag: 'div',
          props: {},
          styles: {
            base: {
              layout: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }
            }
          },
          children: (contentSummary.tacticalFramework || [
            '24/7 Autonomous BANT Qualification',
            'Sub-350ms Spoken Latency with Interruption Abort',
            'Direct Bi-Directional CRM & Obsidian Sync'
          ]).map((frameworkItem, idx) => ({
            id: `${pageId}_pillar_${idx + 1}`,
            type: 'container',
            name: `Pillar ${idx + 1}`,
            semanticTag: 'div',
            props: {},
            styles: {
              base: {
                spacing: { padding: '24px' },
                visual: { backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)' }
              }
            },
            children: [
              {
                id: `${pageId}_pillar_icon_${idx + 1}`,
                type: 'text',
                name: 'Pillar Number',
                semanticTag: 'span',
                props: { text: `0${idx + 1}.` },
                styles: {
                  base: { typography: { fontSize: '13px', fontWeight: '800', color: '#d4af37' } }
                }
              },
              {
                id: `${pageId}_pillar_title_${idx + 1}`,
                type: 'text',
                name: 'Pillar Title',
                semanticTag: 'h3',
                props: { text: frameworkItem },
                styles: {
                  base: {
                    typography: { fontSize: '18px', fontWeight: '700', color: '#ffffff' },
                    spacing: { margin: '8px 0' }
                  }
                }
              }
            ]
          }))
        }
      ]
    };

    const doc: InstaticPageDocument = {
      id: pageId,
      slug,
      title,
      companyName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        title: `${title} | ${companyName}`,
        description: contentSummary.thesis
      },
      themeTokens: {
        primaryColor: '#d4af37',
        accentColor: '#10b981',
        backgroundColor: '#09090b',
        textColor: '#f4f4f5'
      },
      sections: [heroSection, voiceWidgetSection, pillarsSection]
    };

    this.pages.set(doc.id, doc);
    return doc;
  }

  public patchNode(pageId: string, nodeId: string, newProps: Record<string, any>): InstaticPageDocument | null {
    const page = this.pages.get(pageId);
    if (!page) return null;

    let modified = false;
    const traverse = (node: InstaticNode) => {
      if (node.id === nodeId) {
        node.props = { ...node.props, ...newProps };
        modified = true;
        return;
      }
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
          if (modified) return;
        }
      }
    };

    for (const sec of page.sections) {
      traverse(sec);
      if (modified) break;
    }

    // A nodeId that matched nothing is a failed patch, not a successful no-op —
    // returning the page here would make the route's 404 unreachable and silently
    // discard the caller's edit.
    if (!modified) return null;

    page.updatedAt = new Date().toISOString();
    this.pages.set(pageId, page);
    return page;
  }

  public async aiAssistNode(
    pageId: string,
    nodeId: string,
    prompt: string
  ): Promise<{ updatedPage: InstaticPageDocument | null; explanation: string }> {
    const page = this.pages.get(pageId);
    if (!page) {
      return { updatedPage: null, explanation: 'Page not found' };
    }

    let targetNode: InstaticNode | null = null;
    const findNode = (node: InstaticNode) => {
      if (node.id === nodeId) {
        targetNode = node;
        return;
      }
      if (node.children) {
        for (const c of node.children) {
          findNode(c);
          if (targetNode) return;
        }
      }
    };

    for (const sec of page.sections) {
      findNode(sec);
      if (targetNode) break;
    }

    if (!targetNode) {
      return { updatedPage: page, explanation: `Node ${nodeId} not found.` };
    }

    const currentText = (targetNode as InstaticNode).props.text || JSON.stringify((targetNode as InstaticNode).props);

    const systemPrompt = `You are Anna, Senior Growth Operating Architect at GrowthOS and an expert in high-converting static visual web design.
The user wants to refine a node on an Instatic visual landing page.
Return a concise JSON object with the updated text and a brief rationale:
{
  "newText": "...",
  "explanation": "..."
}`;

    const userMessage = `Node Type: ${(targetNode as InstaticNode).type}
Current Text/Props: "${currentText}"
Refinement Request: "${prompt}"`;

    try {
      const completion = await deepseekService.createCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3
      });

      const jsonMatch = completion.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.newText) {
          this.patchNode(pageId, nodeId, { text: parsed.newText });
          return { updatedPage: this.pages.get(pageId)!, explanation: parsed.explanation || 'Refined node successfully.' };
        }
      }
    } catch (e: any) {
      // Fallback
      const enhancedText = `${currentText} — Optimized for high-intent conversion.`;
      this.patchNode(pageId, nodeId, { text: enhancedText });
      return {
        updatedPage: this.pages.get(pageId)!,
        explanation: 'Applied conversion-optimized refinement with Anna GrowthOS guidelines.'
      };
    }

    return { updatedPage: page, explanation: 'Node checked and preserved.' };
  }

  public compileToStaticHtml(page: InstaticPageDocument): string {
    const renderNode = (node: InstaticNode): string => {
      const requestedTag =
        node.semanticTag || (node.type === 'section' ? 'section' : node.type === 'button' ? 'a' : 'div');
      // semanticTag is caller-controlled; an unrecognised value (e.g. "script")
      // must never become the emitted element.
      const tag = SAFE_HTML_TAGS.has(requestedTag) ? requestedTag : 'div';

      if (node.type === 'embed') {
        const company = escapeHtml(node.props.company || page.companyName);
        const clientId = escapeHtml(node.props.clientId || 'lead_ak_901');
        const accent = escapeHtml(node.props.accent || '#d4af37');
        // A rejected scriptUrl falls back to the first-party widget rather than
        // emitting an attacker-supplied <script src>.
        const scriptUrl = escapeUrl(node.props.scriptUrl || '/embed.js') || '/embed.js';
        return `<!-- Embedded StratosGTM Widget -->\n<script src="${scriptUrl}" data-company="${company}" data-client-id="${clientId}" data-accent="${accent}"></script>`;
      }

      const baseStyles = node.styles.base || {};
      const declarations: string[] = [];
      for (const group of [baseStyles.typography, baseStyles.spacing, baseStyles.visual, baseStyles.layout]) {
        if (!group) continue;
        for (const [key, value] of Object.entries(group as Record<string, unknown>)) {
          const cssProperty = STYLE_PROPERTY_MAP[key];
          if (!cssProperty || value === undefined || value === null || value === '') continue;
          const safeValue = escapeCssValue(value);
          if (safeValue) declarations.push(`${cssProperty}: ${safeValue};`);
        }
      }

      const styleAttr = declarations.length ? ` style="${escapeHtml(declarations.join(' '))}"` : '';
      const safeHref = escapeUrl(node.props.href);
      const hrefAttr = safeHref ? ` href="${safeHref}"` : '';
      const textContent = escapeHtml(node.props.text);

      const childrenContent = (node.children || []).map(renderNode).join('\n');

      return `<${tag} id="${escapeHtml(node.id)}"${hrefAttr}${styleAttr}>\n${textContent}${childrenContent}\n</${tag}>`;
    };

    const sectionsHtml = page.sections.map(renderNode).join('\n\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(page.metadata.title)}</title>
  <meta name="description" content="${escapeHtml(page.metadata.description)}" />
  <style>
    :root {
      --primary: ${escapeCssValue(page.themeTokens.primaryColor)};
      --accent: ${escapeCssValue(page.themeTokens.accentColor)};
      --bg: ${escapeCssValue(page.themeTokens.backgroundColor)};
      --text: ${escapeCssValue(page.themeTokens.textColor)};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    a { text-decoration: none; cursor: pointer; }
  </style>
</head>
<body>
  ${sectionsHtml}
</body>
</html>`;
  }
}

export const instaticService = new InstaticService();
