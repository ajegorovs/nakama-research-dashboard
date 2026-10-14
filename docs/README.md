# Documentation map

## Current reference set

| Need | Read |
|---|---|
| Product overview and quick start | [README](../README.md) |
| Four-view design and interaction specification | [Design](design/dashboard-information-architecture-pivot.md) |
| Implemented schema, tools, authorship and paging | [Data/API contract](design/dashboard-minimal-implementation-design.md) |
| Source investigation and data maintenance | [Maintenance](design/dashboard-data-and-maintenance-contract.md) |
| Draft librarian agent/tooling control workstream | [Librarian plan](design/librarian-tooling-plan.md) |
| Presentation, evidence and safety policies | [Decisions](ux-v2/DECISIONS.md) |
| Build, preview, installation and verification | [Development](DEVELOPMENT.md), [preview mechanics](../harness/preview/README.md) |
| Visual information-design research problem and next checkpoint | [Research brief](design/visual-information-design.md) |
| Current representative preview and historical screenshot distinction | [Screenshot gallery](screenshots/README.md) |
| Contributor rules | [AGENTS](../AGENTS.md) and `.agents/skills/` |
| Used dataset provenance | [Corpus](corpus/README.md), [axis rule](corpus/AXIS-RULE.md), [synthetic fixtures](layout-fixtures/README.md) |
| Supported collector transport | [Collector contract](evidence-automation/CONTRACT.md) |

There is no active handoff, correspondence archive or execution ledger in this documentation set.
Important behavior and remaining qualifications belong in the current contract/developer guide.
Screenshots remain temporarily for upcoming UI work and measure their recorded builds.

## Tool inputs are separate from documentation

The evaluator template and rubric under `librarian-reconciliation/` are byte-pinned harness inputs.
Their historical proposal references do not prescribe current work. The semantic-pack guide and
E2E/tooling READMEs explain retained optional tools, not deployment authority. WP1 JSON evidence
under `reviews/` is read directly by tests and is retained as a fixture, not a current report.
Do not delete these inputs merely because their names reflect development history.

## Historical recovery

Pre-retirement baseline: `73a411ff56ab0e1a92c506abb5c58777986e08a3`.

```bash
git show 73a411ff56ab0e1a92c506abb5c58777986e08a3:path/to/retired/file
```

Earlier specs, reviews, handoffs and execution evidence are recoverable there. Source comments
citing retired paths are historical provenance, not missing runtime instructions. Published
history is not rewritten. Raw datasets, transcripts, screenshots and HTML prototypes remain;
retiring their associated prose does not turn old measurements into current claims.
