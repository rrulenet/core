import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { dateToZdt, zdtToDate } from '../dist/time.mjs';

test('public time helpers use native Temporal when available and retain the polyfill fallback', () => {
  const provider = globalThis.Temporal ?? Temporal;
  const instant = new Date('2026-10-25T01:30:00Z');
  const value = dateToZdt(instant, 'Europe/Paris');

  assert.ok(value instanceof provider.ZonedDateTime);
  assert.equal(value.toString(), '2026-10-25T02:30:00+01:00[Europe/Paris]');
  assert.equal(zdtToDate(value).toISOString(), instant.toISOString());
});
