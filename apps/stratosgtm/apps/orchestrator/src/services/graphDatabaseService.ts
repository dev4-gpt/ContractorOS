import * as fs from 'fs';
import * as path from 'path';

export type NodeType =
  | 'VoiceSession'
  | 'Lead'
  | 'Member'
  | 'Objection'
  | 'GuardrailPolicy'
  | 'ResearchLane'
  | 'ContentPack'
  | 'Asset'
  | 'SelfHealingEvent'
  | 'Offer'
  | 'BrandVoice';

export type EdgeType =
  | 'QUALIFIED_AS'
  | 'RAISED_OBJECTION'
  | 'TRIGGERED_POLICY'
  | 'RESEARCHED_IN'
  | 'SYNTHESIZED_INTO'
  | 'CONTAINS_ASSET'
  | 'HEALED_BY'
  | 'ASSOCIATED_WITH'
  | 'SCHEDULED_FOR'
  | 'HAS_BRAND_VOICE';

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  properties: Record<string, any>;
  community?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  label?: string;
  weight?: number;
  properties?: Record<string, any>;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  nodeTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
}

export class GraphDatabaseService {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private dataDir: string;
  private dbFilePath: string;

  constructor(baseDir?: string) {
    this.dataDir = baseDir || path.resolve(process.cwd(), 'data');
    this.dbFilePath = path.join(this.dataDir, 'knowledge_graph.json');
    this.ensureDirExists(this.dataDir);
    this.loadFromDisk();
    this.seedDefaultKnowledgeGraph();
  }

  private ensureDirExists(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  public addNode(node: GraphNode): GraphNode {
    this.nodes.set(node.id, { ...node });
    this.persistToDisk();
    return node;
  }

  public addEdge(edge: GraphEdge): GraphEdge {
    if (!edge.id) {
      edge.id = `edge_${edge.source}_${edge.type}_${edge.target}`;
    }
    this.edges.set(edge.id, { ...edge });
    this.persistToDisk();
    return edge;
  }

  public getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  public getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  public getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  public getEdgesForNode(nodeId: string): { outgoing: GraphEdge[]; incoming: GraphEdge[] } {
    const outgoing: GraphEdge[] = [];
    const incoming: GraphEdge[] = [];

    for (const edge of this.edges.values()) {
      if (edge.source === nodeId) outgoing.push(edge);
      if (edge.target === nodeId) incoming.push(edge);
    }

    return { outgoing, incoming };
  }

  public getStats(): GraphStats {
    const nodeTypes: Record<string, number> = {};
    const edgeTypes: Record<string, number> = {};

    for (const node of this.nodes.values()) {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
    }

    for (const edge of this.edges.values()) {
      edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1;
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      nodeTypes,
      edgeTypes
    };
  }

  private persistToDisk() {
    try {
      this.ensureDirExists(this.dataDir);
      const data = {
        updatedAt: new Date().toISOString(),
        nodes: Array.from(this.nodes.values()),
        edges: Array.from(this.edges.values())
      };
      fs.writeFileSync(this.dbFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[GraphDatabase] Failed to persist graph to disk:', err);
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.nodes)) {
          data.nodes.forEach((n: GraphNode) => this.nodes.set(n.id, n));
        }
        if (Array.isArray(data.edges)) {
          data.edges.forEach((e: GraphEdge) => this.edges.set(e.id, e));
        }
        console.log(
          `[GraphDatabase] Loaded ${this.nodes.size} nodes and ${this.edges.size} edges from ${this.dbFilePath}`
        );
      }
    } catch (err) {
      console.warn('[GraphDatabase] Could not load existing graph database, starting fresh:', err);
    }
  }

  public seedDefaultKnowledgeGraph() {
    if (this.nodes.size > 0) return;

    // Offers & Programs
    this.addNode({
      id: 'offer_pro_mentorship',
      label: 'Pro Mentorship ($2,997)',
      type: 'Offer',
      properties: { price: 2997, paymentPlan: '497/mo', format: 'Cohort + 1-on-1' }
    });
    this.addNode({
      id: 'offer_vip_mastermind',
      label: 'VIP Mastermind ($7,500)',
      type: 'Offer',
      properties: { price: 7500, monthlyFee: 997, format: 'Private Mastermind' }
    });

    // Guardrail Policies
    this.addNode({
      id: 'policy_max_discount_15',
      label: 'Guardrail: Max 15% Autonomous Discount',
      type: 'GuardrailPolicy',
      properties: {
        maxDiscountPercent: 15,
        enforcement: 'deterministic_clamp',
        description: 'Voice agent clamped to max 15% discount regardless of user demands'
      }
    });
    this.addNode({
      id: 'policy_pii_redaction',
      label: 'Guardrail: Real-Time PII Redaction',
      type: 'GuardrailPolicy',
      properties: { rules: ['phone_masking', 'credit_card_masking'] }
    });

    // Voice Sessions
    this.addNode({
      id: 'session_inbound_jason',
      label: 'Voice Call: Alex Kim (After-Hours Inbound)',
      type: 'VoiceSession',
      properties: {
        persona: 'inbound_sdr',
        durationSeconds: 142,
        sentiment: 'high_intent',
        audioFormat: '24kHz_mono_pcm16'
      }
    });
    this.addNode({
      id: 'session_retention_sarah',
      label: 'Voice Call: Sarah Jenkins (Churn Save)',
      type: 'VoiceSession',
      properties: {
        persona: 'churn_retention',
        durationSeconds: 198,
        sentiment: 'retained',
        audioFormat: '24kHz_mono_pcm16'
      }
    });

    // Leads & Members
    this.addNode({
      id: 'lead_alex_kim',
      label: 'Lead: Alex Kim',
      type: 'Lead',
      properties: {
        email: 'alex.kim@acmecoaching.example',
        budget: '5k_to_15k',
        bantScore: 85,
        stage: 'call_scheduled',
        consultationSlot: 'Tomorrow at 2:00 PM EST'
      }
    });
    this.addNode({
      id: 'member_sarah_jenkins',
      label: 'Member: Sarah Jenkins',
      type: 'Member',
      properties: {
        memberId: 'mem_101',
        email: 'sarah.j@example.com',
        tier: 'vip_mastermind',
        status: 'retained_with_discount',
        appliedDiscountPercent: 15
      }
    });

    // Objections
    this.addNode({
      id: 'obj_cashflow_tight',
      label: 'Objection: Cash Flow Tight (35% Discount Request)',
      type: 'Objection',
      properties: {
        category: 'price_cashflow',
        verbatim: 'I love the mastermind, but my cash flow is tight. Can you give me a 35% discount?',
        resolution: 'clamped_15_percent_plus_growth_audit'
      }
    });
    this.addNode({
      id: 'obj_pricing_guarantee',
      label: 'Objection: Price vs Risk (Need Action Guarantee)',
      type: 'Objection',
      properties: {
        category: 'risk_reversal',
        verbatim: 'How do I know I will make back the investment if I have no audience?',
        resolution: '14_day_action_guarantee'
      }
    });

    // Research Lanes
    this.addNode({
      id: 'lane_creator_rag',
      label: 'Research Lane: Creator RAG (Internal Offers)',
      type: 'ResearchLane',
      properties: {
        sourceTitle: 'Creator Accelerator Pricing Tiers',
        relevanceScore: 0.96,
        excerpt: 'Self-Paced Sprint at $997, Pro Mentorship at $2,997 ($497/mo), Elite Mastermind at $7,500.'
      }
    });
    this.addNode({
      id: 'lane_market_trends',
      label: 'Research Lane: Market Trends (Action Guarantees)',
      type: 'ResearchLane',
      properties: {
        sourceTitle: 'State of Digital Education 2026',
        relevanceScore: 0.89,
        excerpt: 'Action-based refund guarantees achieve 4.2x higher course completion rates.'
      }
    });
    this.addNode({
      id: 'lane_community_objections',
      label: 'Research Lane: Community Objections (Zero Audience)',
      type: 'ResearchLane',
      properties: {
        sourceTitle: 'Student Inbound Voice Call Analytics (Last 90 Days)',
        relevanceScore: 0.94,
        excerpt: 'Top objection: Will this work if I am starting from zero audience?'
      }
    });

    // Content Pack
    this.addNode({
      id: 'pack_cf_101',
      label: 'Content Pack: Tough Pricing Objections & 14-Day Guarantee',
      type: 'ContentPack',
      properties: {
        thesis: 'High-ticket buyers do not buy information; they buy risk removal and speed of implementation.',
        status: 'needs_approval',
        model: 'DeepSeek-R1',
        tokenCost: 0.032
      }
    });

    // Assets
    this.addNode({
      id: 'asset_x_thread',
      label: 'X Thread (5 Tweets)',
      type: 'Asset',
      properties: {
        channel: 'twitter',
        tweetCount: 5,
        maxLengthConstraint: 280,
        status: 'verified_under_280_chars'
      }
    });
    this.addNode({
      id: 'asset_newsletter',
      label: 'Newsletter: The 3-Sentence Reframe',
      type: 'Asset',
      properties: {
        channel: 'email',
        subject: 'The 3-Sentence Reframe That Closed $42,000 in Digital Products',
        status: 'ready'
      }
    });
    this.addNode({
      id: 'asset_webinar_script',
      label: 'Webinar Pitch Script & Risk Reversal',
      type: 'Asset',
      properties: {
        channel: 'webinar_video',
        durationTarget: '15_min_closing_section',
        status: 'ready'
      }
    });

    // Self-Healing Event
    this.addNode({
      id: 'heal_tweet_3_length',
      label: 'Self-Healing: Tweet #3 Length Truncation',
      type: 'SelfHealingEvent',
      properties: {
        rule: 'tweet_length_exceeded_280',
        initialLength: 312,
        healedLength: 234,
        healedSuccessfully: true,
        reasoningEngine: 'DeepSeek-R1'
      }
    });

    // Edges
    this.addEdge({
      id: 'edge_sess_jason_lead',
      source: 'session_inbound_jason',
      target: 'lead_alex_kim',
      type: 'QUALIFIED_AS',
      label: 'BANT Score 85'
    });
    this.addEdge({
      id: 'edge_lead_jason_offer',
      source: 'lead_alex_kim',
      target: 'offer_pro_mentorship',
      type: 'ASSOCIATED_WITH',
      label: 'Matched Tier'
    });
    this.addEdge({
      id: 'edge_sess_sarah_obj',
      source: 'session_retention_sarah',
      target: 'obj_cashflow_tight',
      type: 'RAISED_OBJECTION',
      label: 'Cash Flow Tight'
    });
    this.addEdge({
      id: 'edge_sess_sarah_policy',
      source: 'session_retention_sarah',
      target: 'policy_max_discount_15',
      type: 'TRIGGERED_POLICY',
      label: 'Clamped 35% to 15%'
    });
    this.addEdge({
      id: 'edge_obj_cashflow_member',
      source: 'obj_cashflow_tight',
      target: 'member_sarah_jenkins',
      type: 'ASSOCIATED_WITH',
      label: 'Member Churn Save'
    });
    this.addEdge({
      id: 'edge_obj_guarantee_lane1',
      source: 'obj_pricing_guarantee',
      target: 'lane_creator_rag',
      type: 'RESEARCHED_IN',
      label: 'Relevance 0.96'
    });
    this.addEdge({
      id: 'edge_obj_guarantee_lane2',
      source: 'obj_pricing_guarantee',
      target: 'lane_market_trends',
      type: 'RESEARCHED_IN',
      label: 'Relevance 0.89'
    });
    this.addEdge({
      id: 'edge_obj_guarantee_lane3',
      source: 'obj_pricing_guarantee',
      target: 'lane_community_objections',
      type: 'RESEARCHED_IN',
      label: 'Relevance 0.94'
    });
    this.addEdge({
      id: 'edge_lane1_pack',
      source: 'lane_creator_rag',
      target: 'pack_cf_101',
      type: 'SYNTHESIZED_INTO'
    });
    this.addEdge({
      id: 'edge_lane2_pack',
      source: 'lane_market_trends',
      target: 'pack_cf_101',
      type: 'SYNTHESIZED_INTO'
    });
    this.addEdge({
      id: 'edge_lane3_pack',
      source: 'lane_community_objections',
      target: 'pack_cf_101',
      type: 'SYNTHESIZED_INTO'
    });
    this.addEdge({
      id: 'edge_pack_asset_twitter',
      source: 'pack_cf_101',
      target: 'asset_x_thread',
      type: 'CONTAINS_ASSET'
    });
    this.addEdge({
      id: 'edge_pack_asset_email',
      source: 'pack_cf_101',
      target: 'asset_newsletter',
      type: 'CONTAINS_ASSET'
    });
    this.addEdge({
      id: 'edge_pack_asset_webinar',
      source: 'pack_cf_101',
      target: 'asset_webinar_script',
      type: 'CONTAINS_ASSET'
    });
    this.addEdge({
      id: 'edge_asset_twitter_heal',
      source: 'asset_x_thread',
      target: 'heal_tweet_3_length',
      type: 'HEALED_BY',
      label: 'Reduced 312 -> 234 chars'
    });

    this.persistToDisk();
  }

  // ==========================================
  // Exporter: Obsidian Vault (Obsidian Markdown)
  // ==========================================
  public exportToObsidianVault(vaultDir: string): { filesCreated: number; vaultDir: string } {
    this.ensureDirExists(vaultDir);

    const subfolders = ['Leads', 'Members', 'Voice-Sessions', 'Objections', 'Content-Packs', 'Assets', 'Self-Healing', 'Policies'];
    subfolders.forEach((f) => this.ensureDirExists(path.join(vaultDir, f)));

    let filesCreated = 0;

    // 1. Generate Index.md (Map of Content MOC)
    const indexContent = `---
title: StratosGTM Knowledge Graph Vault
date: ${new Date().toISOString().split('T')[0]}
tags:
  - moc
  - stratosgtm
  - voice-ai
  - assemblyai
  - deepseek
cssclasses:
  - dashboard
---

# 🎙️ StratosGTM — Knowledge & Revenue Graph

Welcome to the **StratosGTM** persistent vault. This vault connects real-time **AssemblyAI** voice interactions with autonomous **DeepSeek-R1** content synthesis, CRM lead qualification, and self-healing business guardrails.

> [!important] Autonomous Operating System
> Voice conversations are immediately parsed into **BANT qualifications**, **pricing objections**, and **multi-channel content marketing packs** with deterministic guardrails preventing unauthorized discounting.

## 📊 Live System Topology (Mermaid)

\`\`\`mermaid
graph TD
    VS["🎙️ Voice Session (AssemblyAI)"] -->|QUALIFIED_AS| L["👤 Lead: Alex Kim ($10k)"]
    VS -->|RAISED_OBJECTION| O["⚠️ Objection: Cash Flow Tight"]
    VS -->|TRIGGERED_POLICY| P["🛡️ Guardrail: 15% Max Discount"]
    O -->|RESEARCHED_IN| RL["🔬 3 Parallel Research Lanes"]
    RL -->|SYNTHESIZED_INTO| CP["📦 Content Pack: 14-Day Guarantee"]
    CP -->|CONTAINS_ASSET| A1["🐦 X Thread (5 Tweets)"]
    CP -->|CONTAINS_ASSET| A2["📧 Newsletter"]
    CP -->|CONTAINS_ASSET| A3["🎬 Webinar Script"]
    A1 -->|HEALED_BY| SH["🔄 Self-Healing (Length Fix)"]
\`\`\`

## 🗂️ Knowledge Vault Sections

- [[Leads/lead_alex_kim|Lead: Alex Kim]] — Score 85, $5k-$15k budget, booked for consultation.
- [[Members/member_sarah_jenkins|Member: Sarah Jenkins]] — Retained mastermind member, 15% clamped discount applied.
- [[Voice-Sessions/session_inbound_jason|Voice Session: Inbound Jason]] — AssemblyAI 24kHz stream transcript & telemetry.
- [[Objections/obj_cashflow_tight|Objection: Cash Flow Tight]] — Churn risk objection and policy resolution.
- [[Content-Packs/pack_cf_101|Content Pack: 14-Day Guarantee]] — DeepSeek-R1 synthesized multi-asset marketing pack.
- [[Self-Healing/heal_tweet_3_length|Self-Healing: Tweet 3 Length]] — Autonomous self-repair audit log (312 -> 234 chars).
- [[Policies/policy_max_discount_15|Policy: Max 15 Percent Discount]] — Deterministic business guardrail rule.

## 📈 Graph Statistics
- **Total Nodes:** ${this.nodes.size}
- **Total Edges:** ${this.edges.size}
- **Updated:** \`${new Date().toISOString()}\`
`;
    fs.writeFileSync(path.join(vaultDir, 'Index.md'), indexContent, 'utf-8');
    filesCreated++;

    // 2. Generate Node Notes
    for (const node of this.nodes.values()) {
      let folder = 'Other';

      if (node.type === 'Lead') folder = 'Leads';
      else if (node.type === 'Member') folder = 'Members';
      else if (node.type === 'VoiceSession') folder = 'Voice-Sessions';
      else if (node.type === 'Objection') folder = 'Objections';
      else if (node.type === 'ContentPack') folder = 'Content-Packs';
      else if (node.type === 'Asset') folder = 'Assets';
      else if (node.type === 'SelfHealingEvent') folder = 'Self-Healing';
      else if (node.type === 'GuardrailPolicy') folder = 'Policies';
      else if (node.type === 'ResearchLane') folder = 'Content-Packs';
      else if (node.type === 'Offer') folder = 'Policies';

      const safeFilename = `${node.id}.md`;
      const filePath = path.join(vaultDir, folder, safeFilename);

      const { outgoing, incoming } = this.getEdgesForNode(node.id);

      const frontmatter = [
        '---',
        `id: "${node.id}"`,
        `title: "${node.label}"`,
        `type: "${node.type}"`,
        `date: "${new Date().toISOString().split('T')[0]}"`,
        'tags:',
        `  - ${node.type.toLowerCase()}`,
        '  - stratosgtm'
      ];

      for (const [k, v] of Object.entries(node.properties)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          frontmatter.push(`${k}: ${JSON.stringify(v)}`);
        }
      }
      frontmatter.push('---', '');

      const bodyLines: string[] = [
        ...frontmatter,
        `# ${node.label}`,
        '',
        `> [!info] Node Metadata`,
        `> **Type:** \`${node.type}\` | **ID:** \`${node.id}\``,
        ''
      ];

      // Properties Table
      bodyLines.push('## Properties', '', '| Property | Value |', '| :--- | :--- |');
      for (const [k, v] of Object.entries(node.properties)) {
        const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
        bodyLines.push(`| **${k}** | \`${valStr}\` |`);
      }
      bodyLines.push('');

      // Connected Outgoing Edges
      if (outgoing.length > 0) {
        bodyLines.push('## Outgoing Relationships', '');
        for (const edge of outgoing) {
          const targetNode = this.nodes.get(edge.target);
          const targetLabel = targetNode ? targetNode.label : edge.target;
          bodyLines.push(`- **-[:${edge.type}]->** [[${edge.target}|${targetLabel}]] ${edge.label ? `_(${edge.label})_` : ''}`);
        }
        bodyLines.push('');
      }

      // Connected Incoming Edges
      if (incoming.length > 0) {
        bodyLines.push('## Incoming Relationships', '');
        for (const edge of incoming) {
          const sourceNode = this.nodes.get(edge.source);
          const sourceLabel = sourceNode ? sourceNode.label : edge.source;
          bodyLines.push(`- **<-[:${edge.type}]-** [[${edge.source}|${sourceLabel}]] ${edge.label ? `_(${edge.label})_` : ''}`);
        }
        bodyLines.push('');
      }

      fs.writeFileSync(filePath, bodyLines.join('\n'), 'utf-8');
      filesCreated++;
    }

    return { filesCreated, vaultDir };
  }

  // ==========================================
  // Exporter: Open-Source Cypher Format (Neo4j, FalkorDB, Memgraph)
  // ==========================================
  public exportToCypher(outputPath: string): string {
    const lines: string[] = [
      '// StratosGTM Knowledge Graph Cypher DDL/DML Export',
      `// Generated at: ${new Date().toISOString()}`,
      ''
    ];

    // Create Nodes
    for (const node of this.nodes.values()) {
      const sanitizedProps = JSON.stringify(node.properties).replace(/"(\w+)":/g, '$1:');
      lines.push(
        `MERGE (n:${node.type} {id: "${node.id}"}) SET n.label = "${node.label.replace(/"/g, '\\"')}", n += ${sanitizedProps};`
      );
    }

    lines.push('');

    // Create Edges
    for (const edge of this.edges.values()) {
      const relProps = edge.properties ? JSON.stringify(edge.properties).replace(/"(\w+)":/g, '$1:') : '{}';
      lines.push(
        `MATCH (s {id: "${edge.source}"}), (t {id: "${edge.target}"}) MERGE (s)-[r:${edge.type} ${relProps}]->(t);`
      );
    }

    const content = lines.join('\n');
    fs.writeFileSync(outputPath, content, 'utf-8');
    return content;
  }

  // ==========================================
  // Exporter: GraphML (Gephi, Cytoscape, yEd)
  // ==========================================
  public exportToGraphML(outputPath: string): string {
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns"',
      '    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      '    xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">',
      '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
      '  <key id="type" for="node" attr.name="type" attr.type="string"/>',
      '  <key id="edge_type" for="edge" attr.name="edge_type" attr.type="string"/>',
      '  <graph id="StratosGTM_KnowledgeGraph" edgedefault="directed">'
    ];

    for (const node of this.nodes.values()) {
      lines.push(`    <node id="${node.id}">`);
      lines.push(`      <data key="label">${this.escapeXml(node.label)}</data>`);
      lines.push(`      <data key="type">${this.escapeXml(node.type)}</data>`);
      lines.push(`    </node>`);
    }

    for (const edge of this.edges.values()) {
      lines.push(`    <edge id="${edge.id}" source="${edge.source}" target="${edge.target}">`);
      lines.push(`      <data key="edge_type">${this.escapeXml(edge.type)}</data>`);
      lines.push(`    </edge>`);
    }

    lines.push('  </graph>');
    lines.push('</graphml>');

    const content = lines.join('\n');
    fs.writeFileSync(outputPath, content, 'utf-8');
    return content;
  }

  // ==========================================
  // Exporter: Graphify JSON Format
  // ==========================================
  public exportToGraphifyJson(outputPath: string) {
    const graphifyNodes = Array.from(this.nodes.values()).map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      properties: n.properties,
      source_file: `vault/${n.type}/${n.id}.md`
    }));

    const graphifyEdges = Array.from(this.edges.values()).map((e) => ({
      source: e.source,
      target: e.target,
      relation: e.type,
      label: e.label || e.type,
      confidence: 1.0,
      weight: e.weight || 1.0
    }));

    const data = {
      nodes: graphifyNodes,
      edges: graphifyEdges,
      input_tokens: 0,
      output_tokens: 0
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export const graphDatabaseService = new GraphDatabaseService();
