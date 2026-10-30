# Engine reference

[Package overview](../README.md) · [Release history](https://github.com/rrulenet/core/releases)

## Table of contents

- [Temporal sources](#temporal-sources)
- [Selector validation](#selector-validation)
- [Search completeness](#search-completeness)

## Temporal sources

`RuleSource` advances nominal calendar values for every supported RFC frequency,
including HOURLY, MINUTELY, and SECONDLY. Ambiguous local times use the first
passage. Nonexistent times use the pre-transition offset, following RFC 5545's
verified erratum 4271; subsequent periods keep the nominal clock time. Resolved
collisions are sorted and deduplicated before COUNT. UNTIL is inclusive and
cannot be combined with COUNT. Invalid base-calendar dates are omitted;
RSCALE/SKIP keeps its extension policies.

`ElapsedSource`, exported from `@rrulenet/core/engine`, instead calculates
`start + n * every` on the instant timeline. Its spec requires an exact `start`
and an ISO time duration (`PT30M`, for example), with optional `tzid`, `count`,
or `until`. Steps must be positive whole seconds; exact anchors retain their
precision. The timezone only controls presentation. Most applications should
use `Recurrence.elapsed` from the public recurrence package.

RFC export rejects precision or a local DTSTART boundary it cannot preserve.
UNTIL is serialized in UTC. Unbounded source `all()` retains the existing finite
preview convention (513 values); use bounded or directional queries for other
parts of an unbounded series.

`RuleSource.iterate()`, `ElapsedSource.iterate()`, and `SetEngine.iterate()`
provide ordered streams for callers that stop early. RRULE COUNT applies before
explicit dates and exclusions. Dedicated RSCALE month/year sources and custom
sources without `iterate()` retain materialized traversal.

## Selector validation

Rule options and RFC parsing reject invalid `BYHOUR`, `BYMINUTE`, `BYSECOND`,
`BYMONTH`, and `BYMONTHDAY` values with a `RangeError` identifying the field
and offending value. Mixed valid/invalid lists are rejected as a whole.
The `bynmonthday` compatibility alias is validated too. Valid negative month
days and supported RSCALE leap-month tokens are accepted.

`BYSECOND=60` uses RFC 5545's fallback to second 59. Resulting collisions are
deduplicated before BYSETPOS and COUNT, while serialization retains the original
selector. Valid selectors that generate nonexistent calendar dates, such as day
31 in February, keep their existing omission or explicit RSCALE/SKIP behavior.

Repeated `BYHOUR`, `BYMINUTE`, and `BYSECOND` members represent one candidate
value during expansion. They do not shift BYSETPOS positions or consume COUNT;
the original lists remain available for serialization.

Positional selection uses the distinct chronological candidates of the whole
frequency interval. For example, a yearly rule spanning several months applies
BYSETPOS after expanding every selected month. Overlapping positive/negative
selectors and repeated days or weeks do not occupy additional positions.

Numeric RFC tokens must be decimal integers. Empty list members, hexadecimal
values, exponent notation, fractional tokens, and unsafe integers are rejected
before conversion, rather than silently changing a selector.

## Search completeness

Calendar-clock queries detect unreachable subdaily clock phases without moving
DTSTART or relaxing filters. A proven impossible phase produces an empty result.
If the calendar search exhausts its candidate budget without establishing
completeness, it throws `RecurrenceSearchLimitError` (exported from the package
root and `/engine`), with code `RECURRENCE_SEARCH_LIMIT`. Do not interpret that
error as proof that a schedule has no further occurrences. Dedicated RSCALE
month/year expansion retains its separately bounded search implementation.

Directional set queries search relative to their boundary instead of using the
finite `all()` preview. Streaming filters and directional set searches also
throw `RecurrenceSearchLimitError` if their search budget is exhausted.
