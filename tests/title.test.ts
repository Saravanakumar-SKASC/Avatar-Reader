import { describe, expect, it } from 'vitest';
import { looksLikeFilename, prettifyTitle } from '../lib/title';

describe('prettifyTitle', () => {
  it('cleans the real filenames in the demo library', () => {
    expect(prettifyTitle('005-SUNNY-MEADOWS-Free-Childrens-Book-By-Monkey-Pen.pdf')).toBe(
      'Sunny Meadows Free Childrens Book By Monkey Pen' // "By" was already cased by the author
    );
    expect(prettifyTitle('001-HIDE-AND-SEEK-Free-Childrens-Book-By-Monkey-Pen')).toBe(
      'Hide and Seek Free Childrens Book By Monkey Pen' // "AND" was ALLCAPS, so we re-case it
    );
    expect(prettifyTitle('003-DOING_MY_CHORES.pdf')).toBe('Doing My Chores');
  });
  it('leaves identifiers and deliberate casing alone', () => {
    expect(prettifyTitle('1706.03762v7.pdf')).toBe('1706.03762v7');
    expect(prettifyTitle('The Lighthouse at Marrow Point')).toBe('The Lighthouse at Marrow Point');
    expect(prettifyTitle('iPhone Design Notes')).toBe('iPhone Design Notes');
  });
  it('never returns an empty title', () => {
    expect(prettifyTitle('42.pdf')).toBe('42');
  });
});

describe('looksLikeFilename', () => {
  it('flags raw filenames and spares real titles', () => {
    expect(looksLikeFilename('005-SUNNY-MEADOWS-Free')).toBe(true);
    expect(looksLikeFilename('DOING_MY_CHORES')).toBe(true);
    expect(looksLikeFilename('Sunny Meadows Free Childrens Book')).toBe(false);
    expect(looksLikeFilename('The Lighthouse at Marrow Point')).toBe(false);
  });
});
