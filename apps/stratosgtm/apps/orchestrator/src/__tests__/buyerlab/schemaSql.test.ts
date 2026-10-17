import { readFileSync } from 'fs';
import { join } from 'path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { buyerProjects, buyerSources, buyerPersonas, buyerRuns, buyerRunSteps, buyerOutcomes } from '../../db/schemaBuyerLab';

const sql = readFileSync(join(__dirname, '../../db/sql/buyerlab.sql'), 'utf8');

describe('buyerlab.sql matches schemaBuyerLab.ts', () => {
  const tables = [buyerProjects, buyerSources, buyerPersonas, buyerRuns, buyerRunSteps, buyerOutcomes];

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))('%s: every column is in the DDL', (name, table) => {
    const block = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\(([\\s\\S]*?)\\n\\);`));
    expect(block).not.toBeNull();
    for (const col of getTableConfig(table).columns) {
      expect(block![1]).toMatch(new RegExp(`\\b${col.name}\\b`));
    }
  });

  it('is additive only', () => {
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w+\s+SET\b/i);
  });

  it('every statement is idempotent', () => {
    const statements = sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
    for (const s of statements) expect(s).toMatch(/^CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS /);
  });
});
