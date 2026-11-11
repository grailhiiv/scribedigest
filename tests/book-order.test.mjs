import test from 'node:test';
import assert from 'node:assert/strict';
import { sortBooksByOrder } from '../lib/book-order.ts';

test('saved order persists while new books remain first and deleted IDs are ignored', () => {
  const books = [{ id: 'new' }, { id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(sortBooksByOrder(books, ['c', 'deleted', 'a', 'b']).map(book => book.id), ['new', 'c', 'a', 'b']);
  assert.deepEqual(books.map(book => book.id), ['new', 'a', 'b', 'c']);
});

test('missing, invalid, and duplicate order entries retain a stable order', () => {
  const books = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(sortBooksByOrder(books, [null, 'c', 'c']).map(book => book.id), ['a', 'b', 'c']);
  assert.deepEqual(sortBooksByOrder(books, []).map(book => book.id), ['a', 'b', 'c']);
});
