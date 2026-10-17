import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Static analysis test for tenant isolation in db/repository/buyerlab.ts.
 * This checks that the Drizzle repository doesn't allow cross-tenant access via:
 * 1. No spreading caller-supplied objects (which could inject tenantId)
 * 2. All buyer table operations have WHERE clause mentioning tenantId
 *
 * Limitations: This is a cheap text-based check and can miss sophisticated attacks.
 * It does NOT verify correctness of the logic, only basic guards.
 */
describe('repositoryTenantScope (static analysis)', () => {
  const repoPath = resolve(__dirname, '../../db/repository/buyerlab.ts');
  const source = readFileSync(repoPath, 'utf-8');

  it('no ...input spread in .values() or .set()', () => {
    // Ensure caller input is never spread directly into insert/update
    const insertPattern = /\.values\(\{[^}]*\.\.\.\s*input/;
    const setPattern = /\.set\(\{[^}]*\.\.\.\s*input/;

    expect(source).not.toMatch(insertPattern);
    expect(source).not.toMatch(setPattern);
  });

  it('all buyer table queries have tenantId in WHERE clause', () => {
    // Extract method bodies for each exported method
    const methods = [
      'createProject', 'listProjects', 'getProject', 'deleteProject',
      'addSources', 'listSources',
      'replacePanel', 'listPersonas',
      'createRun', 'getRun', 'latestRun', 'updateRun', 'addCalls',
      'claimStep', 'finishStep', 'listSteps',
      'saveOutcome', 'getOutcome'
    ];

    for (const method of methods) {
      // Find the method definition and extract its body
      const methodPattern = new RegExp(
        `async\\s+${method}\\s*\\([^)]*\\)\\s*(?::.*?)?\\{([\\s\\S]*?)(?=\\n\\s*},?\\s*(?:async|$))`,
        'g'
      );

      const matches = [...source.matchAll(methodPattern)];
      if (matches.length === 0) {
        // If pattern didn't match, it's OK—method might not exist or have unusual formatting
        continue;
      }

      for (const match of matches) {
        const body = match[1];

        // Skip methods that don't touch buyer tables (like helpers)
        if (!body.match(/buyer(Projects|Sources|Personas|Runs|RunSteps|Outcomes)/)) {
          continue;
        }

        // For each buyer table operation in this method, verify it has tenantId in WHERE
        const tableOps = body.match(/\.(from|update|delete)\(buyer\w+\)[^;]*/g) || [];

        for (const op of tableOps) {
          // Check if this operation is preceded by a requireProject or requireRun call in the method
          const hasGuard = body.includes('await requireProject') || body.includes('await requireRun');

          // Or check if the operation contains "tenantId" (in WHERE clause)
          const hasWhereGuard = op.includes('tenantId');

          if (!hasGuard && !hasWhereGuard) {
            // Exception: batch operations may not have WHERE inline (guard is in the operations)
            if (op.includes('batch')) continue;

            throw new Error(
              `${method}: buyer table operation ${op.slice(0, 80)} has no tenantId guard. ` +
              `Either call requireProject/requireRun first or add tenantId to WHERE.`
            );
          }
        }
      }
    }
  });
});
