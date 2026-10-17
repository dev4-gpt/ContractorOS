/**
 * Real Graphify build through the `claude` CLI backend (no model download).
 *
 *   npx tsx scripts/smoke-graphify.ts "<question>" <file> [<file>...]
 *
 * Copies the given files into a temp vault, builds a graph there with `--backend claude-cli`,
 * then asks the question. Keep the files small: every chunk is a model call on your Claude login.
 * Nothing in your own vault changes; the temp folder is deleted at the end.
 */
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GraphifyIndex } from "../packages/core/src/index.ts";

async function main() {
  const [question, ...files] = process.argv.slice(2);
  if (!question || files.length === 0) {
    console.error('usage: npx tsx scripts/smoke-graphify.ts "<question>" <file> [<file>...]');
    process.exit(2);
  }
  const scratch = await mkdtemp(path.join(os.tmpdir(), "reforge-smoke-graphify-"));
  let failed = false;
  try {
    const vault = path.join(scratch, "vault");
    await mkdir(vault, { recursive: true });
    let bytes = 0;
    for (const f of files) {
      await copyFile(f, path.join(vault, path.basename(f)));
      bytes += (await stat(f)).size;
    }
    console.log(`files: ${files.length}  bytes: ${bytes}  backend: claude-cli`);

    const index = new GraphifyIndex({ vaultRoot: vault, workDir: path.join(scratch, "work"), backend: "claude-cli" });
    const started = Date.now();
    const result = await index.build();
    console.log(`build finished in ${((Date.now() - started) / 1000).toFixed(1)}s (staged ${result.stage.files} files, skipped=${result.skipped})`);

    const graph = JSON.parse(await readFile(index.graphPath, "utf8")) as { nodes?: unknown[]; links?: unknown[]; edges?: unknown[] };
    const nodes = graph.nodes?.length ?? 0;
    const edges = (graph.links ?? graph.edges ?? []).length;
    console.log(`graph: ${nodes} nodes, ${edges} edges`);
    console.log(nodes > 0 ? "PASS  the claude-cli backend produced a graph" : "FAIL  the graph is empty");
    if (nodes === 0) failed = true;

    const answer = await index.query(question);
    console.log(`\nquestion: ${question}\n----- answer -----\n${answer}\n----- end -----`);
  } catch (error) {
    console.error("FAIL ", error instanceof Error ? error.message : error);
    failed = true;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
}

main();
