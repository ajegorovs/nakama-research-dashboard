# Synthetic layout fixtures

The fixture is explicitly synthetic and supplies edge states absent from the public corpus.
Its canonical producer is `harness/apply-layout-fixture.mjs`; the standalone preview derives
fixture calls from that producer and applies them through the real plugin action layer.
It covers blocked/evidence-free work, unmapped people, bare repositories, crowded content,
scoped task support and plan steps. It is not evidence of real research completion.

## Preferred UI workflow

```bash
bun harness/preview/run.mjs --checkout /path/to/nakama --dataset fixture --rebuild --watch
```

No running Nakama API, credentials or live database is needed. Use `scale` separately for
oversized data; never merge datasets merely to obtain green coverage.

## Served acceptance

Fixture application and write passes mutate their target. Use a separately authorized,
explicitly selected disposable instance, not retained research or the corpus store.
Read `.agents/skills/acceptance-pass/SKILL.md` before recording a served pass. The served-build
and dataset-identity guards are preconditions. Re-seed the authorized disposable fixture after
a write pass before an ordinary fixture read.

`verify-fixture-read-*.txt` and `screenshots/<viewport>/` are preserved recorded evidence.
Their counts, view names and screenshots belong to their recorded builds, not today's UI.
Current acceptance boundaries are summarized in `docs/DEVELOPMENT.md`.
