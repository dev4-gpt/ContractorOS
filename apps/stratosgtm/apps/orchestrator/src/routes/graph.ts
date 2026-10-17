import { Router, Request, Response } from 'express';
import * as path from 'path';
import { graphDatabaseService } from '../services/graphDatabaseService';

export const graphRouter = Router();

// GET /api/graph/nodes - Retrieve all graph nodes
graphRouter.get('/nodes', (req: Request, res: Response) => {
  const nodes = graphDatabaseService.getAllNodes();
  res.json({ success: true, count: nodes.length, nodes });
});

// GET /api/graph/edges - Retrieve all graph edges
graphRouter.get('/edges', (req: Request, res: Response) => {
  const edges = graphDatabaseService.getAllEdges();
  res.json({ success: true, count: edges.length, edges });
});

// GET /api/graph/stats - Node and edge counts by type
graphRouter.get('/stats', (req: Request, res: Response) => {
  const stats = graphDatabaseService.getStats();
  res.json({ success: true, stats });
});

// GET /api/graph/node/:id - Retrieve specific node + relations
graphRouter.get('/node/:id', (req: Request, res: Response) => {
  const node = graphDatabaseService.getNode(req.params.id);
  if (!node) {
    return res.status(404).json({ success: false, error: 'Node not found' });
  }
  const relations = graphDatabaseService.getEdgesForNode(req.params.id);
  res.json({ success: true, node, relations });
});

// POST /api/graph/export/obsidian - Trigger Obsidian Vault generation
graphRouter.post('/export/obsidian', (req: Request, res: Response) => {
  try {
    const vaultPath = path.resolve(process.cwd(), 'vault');
    const result = graphDatabaseService.exportToObsidianVault(vaultPath);
    res.json({ success: true, message: 'Obsidian vault exported', ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/graph/export/cypher - Trigger Cypher DDL export
graphRouter.post('/export/cypher', (req: Request, res: Response) => {
  try {
    const cypherPath = path.resolve(process.cwd(), 'data', 'knowledge_graph.cypher');
    const content = graphDatabaseService.exportToCypher(cypherPath);
    res.json({ success: true, path: cypherPath, sizeBytes: Buffer.byteLength(content) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/graph/export/graphml - Trigger GraphML XML export
graphRouter.post('/export/graphml', (req: Request, res: Response) => {
  try {
    const graphmlPath = path.resolve(process.cwd(), 'data', 'knowledge_graph.graphml');
    const content = graphDatabaseService.exportToGraphML(graphmlPath);
    res.json({ success: true, path: graphmlPath, sizeBytes: Buffer.byteLength(content) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
