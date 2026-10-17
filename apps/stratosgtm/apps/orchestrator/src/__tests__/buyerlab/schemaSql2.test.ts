import { readFileSync } from 'fs';
import { join } from 'path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { buyerProjects, buyerReports, buyerChats } from '../../db/schemaBuyerLab';

const sql = readFileSync(join(__dirname, '../../db/sql/buyerlab2.sql'), 'utf8');

describe('buyerlab2.sql matches schemaBuyerLab.ts', () => {
  it('adds self_test to buyer_projects', () => {
    expect(sql).toMatch(/ALTER TABLE buyer_projects\s+ADD COLUMN IF NOT EXISTS self_test/i);
  });

  it.each([
    ['buyer_reports', buyerReports],
    ['buyer_chats', buyerChats]
  ])('%s: every column is in the DDL', (name, table) => {
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
    for (const s of statements) expect(s).toMatch(/^(CREATE (TABLE|INDEX|UNIQUE INDEX)|ALTER TABLE \w+ ADD COLUMN) IF NOT EXISTS /);
  });
});
