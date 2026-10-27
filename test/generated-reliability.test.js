import test from 'node:test';
import assert from 'node:assert/strict';
import { RRule, Weekday } from './support/compat.js';
import { utcOracle, minimizeRule } from './support/utc-oracle.js';

const iso = rule => rule.all().map(date => date.toISOString());
const seeds = process.env.RRULENET_TEST_SEED ? [Number(process.env.RRULENET_TEST_SEED)] : [0x5545, 0x7529, 0x20261027];
const cases = Number(process.env.RRULENET_TEST_CASES ?? 48);
assert(Number.isInteger(cases) && cases > 0 && cases <= 10000);

for (const seed of seeds) {
  test(`generated UTC oracle and query invariants: seed=${seed}; cases=${cases}`, () => {
    let state = seed >>> 0;
    const random = max => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return (state >>> 8) % max; };
    const pick = values => values[random(values.length)];
    const pair = values => [pick(values), pick(values)];
    for (let index = 0; index < cases; index++) {
      // High bits avoid low-bit correlations between successive LCG draws.
      const freq = (random(65536) >>> 8) % 4;
      const dtstart = new Date(Date.UTC(2024 + random(4), random(12), 1 + random(20), 9));
      const until = new Date(Date.UTC(dtstart.getUTCFullYear() + (freq === 0 ? 2 : 0), dtstart.getUTCMonth() + (freq === 0 ? 0 : 3), 27, 23, 59, 59));
      const options = { freq, dtstart, until, interval: 1 + random(2),
        byhour: pair([6, 9, 17]), byminute: pair([0, 15, 30]), bysecond: pair([0, 30, 59, 60]),
        bysetpos: pick([[1], [2], [-1], [-2], [1, -1], [3, -3], undefined]) };
      if (freq === 2 || random(3) === 0) options.byweekday = pair([0, 1, 4]).map(day => new Weekday(day));
      if (freq !== 2 && random(3) === 0) options.bymonthday = pair([1, 5, 15, 28, -1]);
      if (freq === 0 && random(2)) options.bymonth = pair([1, 2, 6, 12]);
      const expected = utcOracle(options);
      const matches = candidate => {
        try { return JSON.stringify(iso(new RRule(candidate))) === JSON.stringify(utcOracle(candidate)); }
        catch { return false; }
      };
      if (!matches(options)) {
        const minimal = minimizeRule(options, candidate => !matches(candidate));
        assert.fail(`seed=${seed}; case=${index}; minimized=${JSON.stringify(minimal)}; expected=${JSON.stringify(utcOracle(minimal))}; actual=${JSON.stringify(iso(new RRule(minimal)))}`);
      }
      const rule = new RRule(options);
      const transformed = { ...options };
      for (const [key, values] of Object.entries(options)) {
        if (Array.isArray(values)) transformed[key] = Object.freeze([...values].reverse().concat(values[0]));
      }
      assert.deepEqual(iso(new RRule(transformed, true)), expected, `duplicate/order invariance: seed=${seed}; case=${index}`);
      assert.deepEqual(iso(rule), expected);
      assert.deepEqual(rule.between(dtstart, until, true).map(date => date.toISOString()), expected);
      const boundary = new Date(+dtstart + 25 * 86400000);
      for (const inclusive of [false, true]) {
        assert.equal(rule.after(boundary, inclusive)?.toISOString() ?? null,
          expected.find(value => inclusive ? Date.parse(value) >= +boundary : Date.parse(value) > +boundary) ?? null);
        assert.equal(rule.before(boundary, inclusive)?.toISOString() ?? null,
          expected.filter(value => inclusive ? Date.parse(value) <= +boundary : Date.parse(value) < +boundary).at(-1) ?? null);
      }
      if (expected.length) {
        const { until: _, ...finite } = options;
        finite.count = Math.min(3, expected.length);
        assert.deepEqual(iso(new RRule(finite)), expected.slice(0, finite.count));
      }
    }
  });
}
