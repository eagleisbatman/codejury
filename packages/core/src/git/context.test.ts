import { describe, it, expect } from 'vitest';
import { findEnclosingScope, detectBoundaries, type CodeBoundary } from './context.js';

const tsCode = `import { foo } from 'bar';

export class UserService {
  private db: Database;

  async getUser(id: string) {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id]);
  }

  async deleteUser(id: string) {
    return this.db.execute('DELETE FROM users WHERE id = ?', [id]);
  }
}

export function validateInput(input: string): boolean {
  if (!input) return false;
  return input.length > 0 && input.length < 100;
}

const processData = async (data: unknown[]) => {
  return data.map(d => transform(d));
};
`.split('\n');

const pyCode = `import os

class UserRepository:
    def __init__(self, db):
        self.db = db

    def get_user(self, user_id):
        return self.db.query(user_id)

    def delete_user(self, user_id):
        self.db.delete(user_id)

def validate_input(data):
    if not data:
        return False
    return len(data) > 0
`.split('\n');

describe('detectBoundaries', () => {
  it('detects TypeScript class and methods', () => {
    const boundaries = detectBoundaries(tsCode, 'typescript');
    const names = boundaries.map((b) => b.name);
    expect(names).toContain('UserService');
    expect(names).toContain('getUser');
    expect(names).toContain('validateInput');
  });

  it('detects Python classes and functions', () => {
    const boundaries = detectBoundaries(pyCode, 'python');
    const names = boundaries.map((b) => b.name);
    expect(names).toContain('UserRepository');
    expect(names).toContain('get_user');
    expect(names).toContain('validate_input');
  });

  it('classifies types correctly', () => {
    const boundaries = detectBoundaries(tsCode, 'typescript');
    const classB = boundaries.find((b) => b.name === 'UserService');
    const methodB = boundaries.find((b) => b.name === 'getUser');
    const funcB = boundaries.find((b) => b.name === 'validateInput');
    expect(classB?.type).toBe('class');
    expect(methodB?.type).toBe('method');
    expect(funcB?.type).toBe('function');
  });
});

describe('findEnclosingScope', () => {
  it('finds enclosing class for method line', () => {
    // Line 7 is inside getUser which is inside UserService
    const result = findEnclosingScope(tsCode, 7, 'typescript');
    expect(result.className).toBe('UserService');
    expect(result.functionName).toBe('getUser');
  });

  it('finds standalone function', () => {
    // Line 17 is inside validateInput
    const result = findEnclosingScope(tsCode, 17, 'typescript');
    expect(result.functionName).toBe('validateInput');
    expect(result.className).toBeUndefined();
  });

  it('returns empty for lines outside any scope', () => {
    const result = findEnclosingScope(tsCode, 1, 'typescript');
    expect(result.functionName).toBeUndefined();
    expect(result.className).toBeUndefined();
  });

  it('works with Python indentation scoping', () => {
    const result = findEnclosingScope(pyCode, 8, 'python');
    expect(result.className).toBe('UserRepository');
    expect(result.functionName).toBe('get_user');
  });
});
