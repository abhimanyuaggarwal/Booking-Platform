import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRupees } from './format.js';

test('whole rupees show no decimals', () => {
  assert.equal(formatRupees(50000), '₹500');
});

test('large sums use Indian grouping', () => {
  assert.equal(formatRupees(15000000), '₹1,50,000');
});

test('odd paise keep two decimals', () => {
  assert.equal(formatRupees(50050), '₹500.50');
});
