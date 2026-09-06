import { NextRequest, NextResponse } from 'next/server';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  const buffer = new Uint8Array(await file.arrayBuffer());

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
    );
  }

  return NextResponse.json({ pageCount: pdf.numPages, pages });
}
