import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/extract/route';

describe('POST /api/extract', () => {
  it('returns pageCount > 0 for a sample PDF', async () => {
    const bytes = await readFile(path.join(__dirname, 'fixtures', 'sample.pdf'));
    const formData = new FormData();
    formData.append('file', new File([bytes], 'sample.pdf', { type: 'application/pdf' }));

    const req = new NextRequest('http://localhost/api/extract', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as { pageCount: number; pages: string[] };
    expect(json.pageCount).toBeGreaterThan(0);
    expect(json.pages).toHaveLength(json.pageCount);
    expect(json.pages[0]).toContain('Hello from page one');
  });
});
