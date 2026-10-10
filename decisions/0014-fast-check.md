---
status: accepted
date: 2026-10-10
---

# Test properties with fast-check

## Context

The command reducers must keep every document valid for any sequence of commands, refused commands must leave the document untouched, and the Yjs binding must agree with the reducers, undo exactly and converge. Example tests cannot cover the space of command sequences; generated sequences can.

## Considered options

- fast-check 4.10: property-based testing for TypeScript with shrinking, seeds and Vitest-compatible assertions.
- jsverify and testcheck-js: unmaintained.
- Write it ourselves: a seeded generator is simple, but shrinking a failing 50-command sequence to its four essential commands is not.

## Decision

Use fast-check 4.10.2 as a development dependency of `core`. Sequences are generated as seeds that become commands against the current document, so shrinking keeps them meaningful. The coverage test runs with a fixed seed so its expectation is exact.

## Maintenance and dependencies

fast-check 4.10.2 (released 2026-09-19, MIT, 1,523,883 bytes unpacked) is maintained by Nicolas Dubien with regular releases; its one dependency is pure-rand 8.4.2 (released 2026-07-10, MIT, same maintainer). Development only: nothing ships to users.

Primary sources: <https://registry.npmjs.org/fast-check>, <https://github.com/dubzzz/fast-check>, <https://registry.npmjs.org/pure-rand>.

## Consequences

Property failures arrive with a shrunk counterexample and its seed; the first one found a defect in Yjs undo. Exit cost: the generators are plain functions over seeds; replacing the runner means rewriting `fc.assert` calls and losing shrinking.

## Review date

2027-04-10.
