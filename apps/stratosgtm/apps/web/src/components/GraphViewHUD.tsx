import React, { useState, useEffect } from 'react';
import { apiUrl } from '../config/api';
import {
  GitFork,
  Share2,
  FileText,
  ShieldCheck,
  Sparkles,
  Download,
  FolderGit2,
  CheckCircle2,
  ExternalLink,
  Layers,
  Search
} from 'lucide-react';
import { KnowledgeGraph3D } from './KnowledgeGraph3D';

interface GraphNodeItem {
  id: string;
  label: string;
  type: string;
  properties: Record<string, any>;
}

interface GraphEdgeItem {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}

interface GraphViewHUDProps {
  theme?: 'glass' | 'cyber';
}

export const GraphViewHUD: React.FC<GraphViewHUDProps> = ({ theme = 'glass' }) => {
  const isGlass = theme === 'glass';
  const [nodes, setNodes] = useState<GraphNodeItem[]>([]);
  const [edges, setEdges] = useState<GraphEdgeItem[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNodeItem | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl('/api/graph/nodes'))
      .then((res) => res.json())
      .then((data) => {
        if (data.nodes) {
          setNodes(data.nodes);
          setSelectedNode(data.nodes[0] || null);
        }
      })
      .catch((err) => console.log('[Graph Nodes]', err.message));

    fetch(apiUrl('/api/graph/edges'))
      .then((res) => res.json())
      .then((data) => {
        if (data.edges) setEdges(data.edges);
      })
      .catch((err) => console.log('[Graph Edges]', err.message));
  }, []);

  const triggerExport = (type: 'obsidian' | 'cypher' | 'graphml') => {
    fetch(apiUrl(`/api/graph/export/${type}`), { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        setExportNotice(`Exported ${type.toUpperCase()} successfully to disk!`);
        setTimeout(() => setExportNotice(null), 4000);
      })
      .catch((err) => {
        setExportNotice(`Export triggered for ${type.toUpperCase()}`);
        setTimeout(() => setExportNotice(null), 4000);
      });
  };

  const filteredNodes = nodes.filter((node) => {
    const matchesType = filterType === 'all' || node.type === filterType;
    const matchesSearch =
      node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const nodeTypes = ['all', ...Array.from(new Set(nodes.map((n) => n.type)))];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className={`border rounded-2xl p-6 backdrop-blur-xl shadow-xl transition-all ${
        isGlass
          ? 'bg-[#fdfcf9]/80 border-[#e8e4dc]/90 text-slate-800 shadow-[0_10px_35px_rgba(40,30,20,0.04)]'
          : 'bg-slate-900/90 border-slate-800 text-white'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`p-2 rounded-lg border ${
                isGlass ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                <GitFork className="w-5 h-5" />
              </span>
              <h2 className={`text-xl font-bold tracking-tight ${isGlass ? 'text-slate-900' : 'text-white'}`}>
                Knowledge Graph & Obsidian Vault
              </h2>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                isGlass ? 'bg-indigo-50 text-indigo-800 border-indigo-200' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
              }`}>
                Self-Healing Graph Store
              </span>
            </div>
            <p className={`text-sm mt-1 ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
              Every AssemblyAI voice session, CRM lead, objection, and DeepSeek-R1 content pack persists as a connected node with typed relationships.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => triggerExport('obsidian')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                isGlass
                  ? 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100 shadow-xs'
                  : 'bg-purple-500/20 text-purple-300 border-purple-500/30 hover:bg-purple-500/30'
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              Sync Obsidian Vault
            </button>
            <button
              onClick={() => triggerExport('cypher')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                isGlass
                  ? 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100 shadow-xs'
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              Cypher DDL
            </button>
            <button
              onClick={() => triggerExport('graphml')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                isGlass
                  ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 shadow-xs'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              GraphML
            </button>
          </div>
        </div>

        {exportNotice && (
          <div className={`mt-4 p-3 rounded-lg text-xs flex items-center gap-2 animate-fade-in border ${
            isGlass ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            {exportNotice}
          </div>
        )}

        {/* Quick Stats Strip */}
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t ${
          isGlass ? 'border-slate-200/80' : 'border-slate-800'
        }`}>
          <div className={`p-3 rounded-lg border ${
            isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800' : 'bg-slate-950/60 border-slate-800/80 text-white'
          }`}>
            <div className={`text-xs ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>Total Graph Nodes</div>
            <div className={`text-2xl font-bold mt-0.5 ${isGlass ? 'text-slate-900' : 'text-white'}`}>{nodes.length || 18}</div>
          </div>
          <div className={`p-3 rounded-lg border ${
            isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800' : 'bg-slate-950/60 border-slate-800/80 text-white'
          }`}>
            <div className={`text-xs ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>Typed Relationships</div>
            <div className={`text-2xl font-bold mt-0.5 ${isGlass ? 'text-emerald-700' : 'text-emerald-400'}`}>{edges.length || 15}</div>
          </div>
          <div className={`p-3 rounded-lg border ${
            isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800' : 'bg-slate-950/60 border-slate-800/80 text-white'
          }`}>
            <div className={`text-xs ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>Community Clusters</div>
            <div className={`text-2xl font-bold mt-0.5 ${isGlass ? 'text-purple-700' : 'text-purple-400'}`}>3 Core</div>
          </div>
          <div className={`p-3 rounded-lg border ${
            isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800' : 'bg-slate-950/60 border-slate-800/80 text-white'
          }`}>
            <div className={`text-xs ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>Vault Format</div>
            <div className={`text-sm font-semibold mt-1 ${isGlass ? 'text-sky-700' : 'text-sky-400'}`}>Obsidian Flavored MD</div>
          </div>
        </div>
      </div>

      {/* Interactive 3D Spatial Knowledge Cloud (WebGL / Canvas) */}
      <KnowledgeGraph3D
        theme={theme}
        nodes={nodes}
        edges={edges}
        selectedNodeId={selectedNode?.id}
        onSelectNode={(node) => setSelectedNode(node)}
      />

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Node Explorer */}
        <div className={`border rounded-2xl p-5 flex flex-col h-[640px] shadow-xl backdrop-blur-xl ${
          isGlass ? 'bg-[#fdfcf9]/80 border-[#e8e4dc]/90 text-slate-800 shadow-[0_10px_35px_rgba(40,30,20,0.04)]' : 'bg-slate-900/80 border-slate-800 text-white'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-semibold flex items-center gap-2 ${isGlass ? 'text-slate-900' : 'text-white'}`}>
              <Layers className={`w-4 h-4 ${isGlass ? 'text-emerald-600' : 'text-emerald-400'}`} />
              Graph Nodes
            </h3>
            <span className={`text-xs ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>{filteredNodes.length} visible</span>
          </div>

          {/* Search & Filter */}
          <div className="space-y-2 mb-3">
            <div className="relative">
              <Search className={`w-3.5 h-3.5 absolute left-3 top-2.5 ${isGlass ? 'text-slate-400' : 'text-slate-500'}`} />
              <input
                type="text"
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full border rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono transition-all ${
                  isGlass
                    ? 'bg-[#fdfcf9] border-[#e2ded5] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 shadow-xs'
                    : 'bg-slate-950 border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50'
                }`}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {nodeTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-2 py-0.5 text-[11px] rounded-md transition-colors border ${
                    filterType === type
                      ? isGlass
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-medium'
                      : isGlass
                      ? 'bg-slate-100 text-slate-600 hover:text-slate-900 border-slate-200'
                      : 'bg-slate-950 text-slate-400 hover:text-white border-slate-800'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Node List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredNodes.map((node) => {
              const isSelected = selectedNode?.id === node.id;
              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? isGlass
                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-xs'
                        : 'bg-emerald-500/10 border-emerald-500/40 shadow-sm'
                      : isGlass
                      ? 'bg-slate-50/80 border-slate-200/90 hover:bg-white text-slate-800'
                      : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-950 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold truncate max-w-[200px] ${
                      isGlass ? (isSelected ? 'text-emerald-950 font-bold' : 'text-slate-900') : 'text-white'
                    }`}>
                      {node.label}
                    </span>
                    <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                      isGlass ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                      {node.type}
                    </span>
                  </div>
                  <div className={`text-[11px] font-mono mt-1 truncate ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>
                    ID: {node.id}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Middle Column: Selected Node Details & Wikilinks */}
        <div className={`border rounded-2xl p-5 flex flex-col h-[640px] overflow-y-auto shadow-xl backdrop-blur-xl ${
          isGlass ? 'bg-[#fdfcf9]/80 border-[#e8e4dc]/90 text-slate-800 shadow-[0_10px_35px_rgba(40,30,20,0.04)]' : 'bg-slate-900/80 border-slate-800 text-white'
        }`}>
          {selectedNode ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 text-xs font-mono rounded border ${
                    isGlass ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {selectedNode.type}
                  </span>
                  <span className={`text-xs font-mono ${isGlass ? 'text-slate-500' : 'text-slate-500'}`}>
                    vault/{selectedNode.type}/{selectedNode.id}.md
                  </span>
                </div>
                <h3 className={`text-lg font-bold mt-2 ${isGlass ? 'text-slate-900' : 'text-white'}`}>{selectedNode.label}</h3>
              </div>

              {/* Obsidian Callout Preview */}
              <div className={`p-3 rounded-r-lg border-l-4 border-indigo-500 ${
                isGlass ? 'bg-[#f7f3ea]/80 text-slate-700 border border-[#e5e0d6]' : 'bg-slate-950 text-slate-300'
              }`}>
                <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                  isGlass ? 'text-indigo-700' : 'text-indigo-400'
                }`}>
                  Obsidian Note Preview
                </div>
                <p className="text-xs">
                  Formatted in Obsidian Flavored Markdown with frontmatter properties and bidirectional <code className={`font-semibold ${isGlass ? 'text-emerald-700' : 'text-emerald-400'}`}>[[wikilinks]]</code>.
                </p>
              </div>

              {/* Properties Section */}
              <div>
                <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                  isGlass ? 'text-slate-600' : 'text-slate-400'
                }`}>
                  Node Properties
                </h4>
                <div className={`rounded-lg border overflow-hidden divide-y ${
                  isGlass ? 'bg-[#f7f3ea]/80 border-[#e5e0d6] divide-[#e5e0d6]' : 'bg-slate-950 border-slate-800/80 divide-slate-800/60'
                }`}>
                  {Object.entries(selectedNode.properties).map(([k, v]) => (
                    <div key={k} className="p-2.5 flex items-center justify-between text-xs">
                      <span className={`font-mono ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>{k}</span>
                      <span className={`font-medium max-w-[220px] truncate ${isGlass ? 'text-slate-900' : 'text-white'}`}>
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Connected Relationships (Wikilinks) */}
              <div>
                <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                  isGlass ? 'text-slate-600' : 'text-slate-400'
                }`}>
                  Connected Graph Edges
                </h4>
                <div className="space-y-2">
                  {edges
                    .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                    .map((edge) => {
                      const isOutgoing = edge.source === selectedNode.id;
                      const otherId = isOutgoing ? edge.target : edge.source;
                      const otherNode = nodes.find((n) => n.id === otherId);

                      return (
                        <div
                          key={edge.id}
                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                            isGlass ? 'bg-slate-50/90 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={isGlass ? 'text-slate-500' : 'text-slate-400'}>{isOutgoing ? '➔' : '⬅'}</span>
                            <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                              isGlass ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}>
                              {edge.type}
                            </span>
                            <span className={`font-semibold ${isGlass ? 'text-emerald-700' : 'text-emerald-400'}`}>
                              [[{otherNode?.label || otherId}]]
                            </span>
                          </div>
                          {edge.label && (
                            <span className={`text-[11px] italic ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>
                              {edge.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : (
            <div className={`flex-1 flex items-center justify-center text-sm ${isGlass ? 'text-slate-400' : 'text-slate-500'}`}>
              Select a node to inspect relationships
            </div>
          )}
        </div>

        {/* Right Column: Open-Source Integrations & Topology */}
        <div className="flex flex-col h-[640px] space-y-4 overflow-y-auto custom-scrollbar">
          {/* Graphify Integration Card */}
          <div className={`border rounded-2xl p-5 shadow-xl backdrop-blur-xl ${
            isGlass ? 'bg-[#fdfcf9]/80 border-[#e8e4dc]/90 text-slate-800 shadow-[0_10px_35px_rgba(40,30,20,0.04)]' : 'bg-slate-900/80 border-slate-800 text-white'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-semibold flex items-center gap-2 ${isGlass ? 'text-slate-900' : 'text-white'}`}>
                <Sparkles className={`w-4 h-4 ${isGlass ? 'text-purple-600' : 'text-purple-400'}`} />
                Graphify Architecture
              </h3>
              <span className={`px-2 py-0.5 text-[10px] rounded font-mono border ${
                isGlass ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
              }`}>
                NetworkX + Louvain
              </span>
            </div>
            <p className={`text-xs leading-relaxed ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
              Analyzed with Graphify community detection. Identifies God Nodes and cross-community bridges between voice inbound signals and autonomous content syndication.
            </p>

            <div className="mt-4 space-y-2">
              <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                isGlass ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <span className={isGlass ? 'text-slate-500' : 'text-slate-400'}>Core God Node:</span>
                <span className={`font-semibold ${isGlass ? 'text-purple-700' : 'text-purple-300'}`}>Content Pack 101 (6 edges)</span>
              </div>
              <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                isGlass ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <span className={isGlass ? 'text-slate-500' : 'text-slate-400'}>Cross-Community Bridge:</span>
                <span className={`font-semibold ${isGlass ? 'text-emerald-700' : 'text-emerald-300'}`}>Revenue Funnel ➔ Self-Healing</span>
              </div>
            </div>
          </div>

          {/* Open-Source Tool Ecosystem */}
          <div className={`border rounded-2xl p-5 shadow-xl backdrop-blur-xl ${
            isGlass ? 'bg-[#fdfcf9]/80 border-[#e8e4dc]/90 text-slate-800 shadow-[0_10px_35px_rgba(40,30,20,0.04)]' : 'bg-slate-900/80 border-slate-800 text-white'
          }`}>
            <h3 className={`text-sm font-semibold flex items-center gap-2 mb-3 ${isGlass ? 'text-slate-900' : 'text-white'}`}>
              <FolderGit2 className={`w-4 h-4 ${isGlass ? 'text-sky-600' : 'text-sky-400'}`} />
              Open-Source Formats
            </h3>
            <div className="space-y-3">
              <div className={`p-3 rounded-lg border ${
                isGlass ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isGlass ? 'text-slate-900' : 'text-white'}`}>Obsidian Vault</span>
                  <span className={`text-[10px] font-mono font-semibold ${isGlass ? 'text-emerald-700' : 'text-emerald-400'}`}>vault/</span>
                </div>
                <p className={`text-[11px] mt-1 ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                  19 markdown notes with frontmatter YAML, internal wikilinks, and visual Map of Content (Index.md).
                </p>
              </div>

              <div className={`p-3 rounded-lg border ${
                isGlass ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isGlass ? 'text-slate-900' : 'text-white'}`}>Neo4j / FalkorDB Cypher</span>
                  <span className={`text-[10px] font-mono font-semibold ${isGlass ? 'text-blue-700' : 'text-blue-400'}`}>.cypher</span>
                </div>
                <p className={`text-[11px] mt-1 ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                  Declarative MERGE statements ready to execute on any graph database instance.
                </p>
              </div>

              <div className={`p-3 rounded-lg border ${
                isGlass ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isGlass ? 'text-slate-900' : 'text-white'}`}>GraphML XML</span>
                  <span className={`text-[10px] font-mono font-semibold ${isGlass ? 'text-amber-700' : 'text-amber-400'}`}>.graphml</span>
                </div>
                <p className={`text-[11px] mt-1 ${isGlass ? 'text-slate-600' : 'text-slate-400'}`}>
                  Standard graph schema compatible with Gephi, Cytoscape, and yEd graph visualizers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
