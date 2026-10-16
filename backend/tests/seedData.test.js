import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSeedData } from '../scripts/seedData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'bookleaf_sample_data.json'), 'utf8'),
);

test('assignment seed contains all supplied authors and books with matching royalties', () => {
  assert.deepEqual(validateSeedData(dataset), { authorCount: 10, bookCount: 18 });
});

test('seed validation rejects pending royalty mismatches before database writes', () => {
  const invalid = structuredClone(dataset);
  invalid.authors[0].books[0].royalty_pending += 1;
  assert.throws(() => validateSeedData(invalid), /royalty_pending must equal/);
});

test('seed validation rejects royalty totals that do not match sales', () => {
  const invalid = structuredClone(dataset);
  invalid.authors[0].books[0].total_royalty_earned += 1;
  invalid.authors[0].books[0].royalty_pending += 1;
  assert.throws(() => validateSeedData(invalid), /copies sold multiplied by royalty per copy/);
});

test('seed validation preserves zero-royalty production titles', () => {
  const productionBooks = dataset.authors.flatMap((author) => author.books)
    .filter((book) => book.status.startsWith('In Production'));
  assert.equal(productionBooks.length, 2);
  for (const book of productionBooks) {
    assert.equal(book.publication_date, null);
    assert.equal(book.mrp, null);
    assert.equal(book.total_copies_sold, 0);
    assert.equal(book.total_royalty_earned, 0);
    assert.equal(book.royalty_paid, 0);
    assert.equal(book.royalty_pending, 0);
  }
});

test('schema computes pending royalty and normalizes author platforms, drafts, replies, and notes', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'schema.sql'), 'utf8');
  assert.doesNotMatch(schema, /royalty_pending/);
  for (const table of ['authors', 'book_platforms', 'ticket_responses', 'ticket_attachments', 'ticket_drafts', 'internal_notes']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
  }
  assert.match(schema, /ENUM\('AUTHOR', 'ADMIN'\)/);
});
