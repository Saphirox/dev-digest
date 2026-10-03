import { describe, it, expect, afterAll } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { record, top, exportTo } from '../src/platform/rate-limit-store.js';

const EXPORT_DIR = path.join(process.cwd(), 'tmp', 'rate-limit-exports');
const writtenFiles: string[] = [];

afterAll(async () => {
  await Promise.all(writtenFiles.map((f) => rm(f, { force: true })));
});

describe('rate-limit-store', () => {
  it('counts hits per IP', () => {
    record('198.51.100.1', {});
    record('198.51.100.1', {});
    const [entry] = top(1).filter((e) => e.ip === '198.51.100.1');
    expect(entry?.count).toBe(2);
  });

  it('orders the top entries by hit count, highest first', () => {
    record('198.51.100.10', {});
    record('198.51.100.11', {});
    record('198.51.100.11', {});
    record('198.51.100.11', {});
    const entries = top(2);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.ip).toBe('198.51.100.11');
    expect(entries[0]?.count).toBeGreaterThanOrEqual(entries[1]?.count ?? 0);
  });

  it('limits the result to n entries', () => {
    record('198.51.100.20', {});
    record('198.51.100.21', {});
    record('198.51.100.22', {});
    expect(top(1)).toHaveLength(1);
  });

  it('writes a JSON snapshot of the current counters to the export directory', async () => {
    record('198.51.100.30', {});
    const target = await exportTo('store-test-snapshot.json');
    writtenFiles.push(target);
    expect(target).toBe(path.join(EXPORT_DIR, 'store-test-snapshot.json'));
    const raw = await readFile(target, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, number>;
    expect(parsed['198.51.100.30']).toBeGreaterThanOrEqual(1);
  });
});
