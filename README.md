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

`@rrulenet/core` provides the shared engine in the ecosystem. It is intended to be consumed by the public packages rather than directly by most applications.

Use `@rrulenet/core` when you are building on top of the engine itself. Use `@rrulenet/rrule` for the classic class-based compat API, and use `@rrulenet/recurrence` for the Temporal-first public API.

## Table of Contents

- [Install](#install)
- [Role in the Ecosystem](#role-in-the-ecosystem)
- [Notes](#notes)

## Install

```bash
npm install @rrulenet/core
```

## Role in the Ecosystem

`@rrulenet/core` owns the shared recurrence engine:
- RFC-style parsing helpers
- timezone-aware occurrence expansion
- set algebra and querying
- text rendering primitives

Most applications should not import it directly. It is the package that powers the public APIs exposed by `@rrulenet/rrule`, `@rrulenet/recurrence`, and the workflows exposed through `@rrulenet/cli`.

## Notes

- `@rrulenet/core` owns the engine implementation.
- `@rrulenet/rrule` and `@rrulenet/recurrence` are the public API façades.
- `@rrulenet/cli` should consume the public APIs rather than deep engine internals.
