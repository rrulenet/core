<p align="center">
  <a href="https://rrule.net">
    <img src="./assets/avatar.svg" alt="rrule.net" width="96" height="96">
  </a>
</p>

<h1 align="center">@rrulenet/core</h1>

<p align="center">
  Shared recurrence engine for parsing, querying, timezone-aware expansion, set composition, and text rendering.
</p>

<p align="center">
  <a href="https://rrule.net">rrule.net</a> •
  <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal">Temporal API</a> •
  <strong>@rrulenet ecosystem</strong>
</p>

<p align="center">
  <code>@rrulenet/rrule</code> ·
  <code>@rrulenet/recurrence</code> ·
  <code>@rrulenet/core</code> ·
  <code>@rrulenet/cli</code>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rrulenet/core"><img src="https://img.shields.io/npm/v/%40rrulenet%2Fcore" alt="npm version"></a>
  <a href="https://jsr.io/@rrulenet/core"><img src="https://img.shields.io/jsr/v/%40rrulenet%2Fcore" alt="JSR version"></a>
  <a href="https://rrulenet.github.io/core/coverage.json"><img src="https://img.shields.io/endpoint?url=https://rrulenet.github.io/core/coverage.json" alt="Coverage"></a>
  <img src="https://img.shields.io/badge/license-MIT-2563EB" alt="MIT License">
</p>

<p align="center">
  <sub><strong>@rrulenet/rrule</strong>: classic API · <strong>@rrulenet/recurrence</strong>: Temporal-first API · <strong>@rrulenet/core</strong>: engine · <strong>@rrulenet/cli</strong>: workflows</sub>
</p>

`@rrulenet/core` provides the shared recurrence engine for the `@rrulenet`
ecosystem. Use it when building a recurrence adapter or working directly with
engine sources. For application code, choose
[`@rrulenet/rrule`](https://github.com/rrulenet/rrule) for the classic `Date` API
or [`@rrulenet/recurrence`](https://github.com/rrulenet/recurrence) for the
Temporal-first API.

## Install

```bash
npm install @rrulenet/core
```

Requires Node.js 20 or later when used with Node. The engine uses native
Temporal where available and the included polyfill otherwise.

## Public entry points

| Import | Purpose |
| --- | --- |
| `@rrulenet/core` | Parsing and shared recurrence APIs |
| `@rrulenet/core/engine` | `RuleSource`, `ElapsedSource`, `DateSource` and `SetEngine` |
| `@rrulenet/core/rule` | Rule types and helpers |
| `@rrulenet/core/options` | Rule options |
| `@rrulenet/core/time` | Date and Temporal conversion helpers |
| `@rrulenet/core/text` | Natural-language rendering |

## Temporal behavior

Calendar rules follow local calendar dates and clock values. Elapsed sources
follow an exact anchor and fixed duration; explicit dates retain their instants.
Calendar overlaps select the first passage, while spring gaps use the
pre-transition offset. COUNT applies before explicit dates and exclusions.

Unbounded `all()` returns a finite preview. Use bounded queries, directional
queries, or ordered iteration when you need more of the series. An error with
code `RECURRENCE_SEARCH_LIMIT` means the query could not establish completeness;
it does not prove that the schedule is empty.

See the [engine reference](https://github.com/rrulenet/core/blob/main/docs/API.md)
for source contracts, selector validation and search behavior.
