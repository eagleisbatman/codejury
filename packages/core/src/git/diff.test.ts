import { describe, it, expect } from 'vitest';
import { detectLanguage, parseDiffOutput } from './diff.js';

describe('detectLanguage', () => {
  it('detects TypeScript', () => expect(detectLanguage('src/app.ts')).toBe('typescript'));
  it('detects TSX', () => expect(detectLanguage('src/App.tsx')).toBe('typescript'));
  it('detects Python', () => expect(detectLanguage('main.py')).toBe('python'));
  it('detects Rust', () => expect(detectLanguage('lib.rs')).toBe('rust'));
  it('detects Go', () => expect(detectLanguage('main.go')).toBe('go'));
  it('returns unknown for unknown ext', () => expect(detectLanguage('Makefile')).toBe('unknown'));
});

describe('parseDiffOutput', () => {
  const sampleDiff = `diff --git a/src/api/queries.ts b/src/api/queries.ts
index abc1234..def5678 100644
--- a/src/api/queries.ts
+++ b/src/api/queries.ts
@@ -40,7 +40,7 @@ export function buildQuery(filters: string, sort_by: string) {
   const db = getConnection();
   const table = 'users';
-  const query = \`SELECT * FROM \${table} WHERE \${filters} ORDER BY \${sort_by}\`;
+  const query = sql\`SELECT * FROM \${sql.identifier(table)} WHERE \${sql.raw(sanitize(filters))} ORDER BY \${sql.identifier(sort_by)}\`;
   return db.execute(query);
 }
`;

  it('parses a single file diff', () => {
    const files = parseDiffOutput(sampleDiff, 3);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('src/api/queries.ts');
    expect(files[0]!.language).toBe('typescript');
    expect(files[0]!.additions).toBe(1);
    expect(files[0]!.deletions).toBe(1);
  });

  it('extracts hunks with line numbers', () => {
    const files = parseDiffOutput(sampleDiff, 3);
    expect(files[0]!.hunks).toHaveLength(1);
    expect(files[0]!.hunks[0]!.startLine).toBe(40);
  });

  it('parses multi-file diff', () => {
    const multiDiff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
 const z = 3;
diff --git a/src/b.py b/src/b.py
--- a/src/b.py
+++ b/src/b.py
@@ -1,2 +1,3 @@
 x = 1
+y = 2
 z = 3
`;
    const files = parseDiffOutput(multiDiff, 3);
    expect(files).toHaveLength(2);
    expect(files[0]!.path).toBe('src/a.ts');
    expect(files[0]!.language).toBe('typescript');
    expect(files[1]!.path).toBe('src/b.py');
    expect(files[1]!.language).toBe('python');
  });

  it('returns empty for empty diff', () => {
    expect(parseDiffOutput('', 3)).toEqual([]);
  });
});
