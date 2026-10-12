# Visual information design — research brief

## Status and purpose

The implemented UI restyling remains accepted within its preview scope. The owner now requests investigation of a further visual-design iteration: acceptance of the earlier milestone does not mean the visual direction is final. This document defines the problem for an agent researching frontend/design resources and skills; it does not authorize redesign, schema changes, deployment or merge.

The product is a research coordination dashboard with Projects, Progress, People and Repositories. The hierarchy displayed is Project → Workstream → Task. It must support orientation, scanning and comparison as well as full substantive reading.

## Owner's problem statement

The UI contains a lot of text. Density was adjusted so it looks less overwhelming, but that solves a different problem. Almost every element still communicates through text; even compact tags have become framed text. The desired improvement is **visual information design, not merely text-density relief**.

Do not reduce this request to “add color,” “increase whitespace,” “use icons,” or “make it modern.” Investigate how different factual structures can become recognizable before the reader parses every sentence.

## Evidence and comparison

See [the current screenshot gallery](../screenshots/README.md). The current captures use the existing synthetic scale-pagination supplement, not live research. They measure the unchanged UI bundle from source commit `bdd349875c08218b40db0a1cf83b5f88d0d5d3a5`.

The earlier static [Progress prototype](../ux-v2/contract/prototypes/progress.html) is a reference, not the current contract. It contains curated example content and older terminology/controls. Comparing it with a scale fixture is not a controlled same-data experiment: deliberately long fixture statements amplify text density, and sparse People/Repository activity limits those examples.

| Aspect | Earlier Progress prototype | Implemented current Progress |
|---|---|---|
| Composition | Problem and activity alongside each other; plan and open problems in separate regions; supporting panels below | Context followed by a vertical sequence of full-width task cards; plan, evidence and activity below |
| State | Compact colored background pills | Mostly neutral outlined labels; colored selector dots and a red blocked label retain some distinction |
| Content types | Dated activity rows, numbered plan steps, problem cards and distinct steering panel | Default visible content concentrates on context and repeated task cards; supporting structures require disclosure |
| Relationships | Rounded supporting tags | Small outlined person/repository links resemble other framed labels |
| Reading hierarchy | Prominent workstream title and several spatial scanning entry points | Task statements are prominent bold blocks; repeated cards dominate the initial viewport |

These are visual observations, not evidence that the old prototype's information architecture should be restored. The current full task statements, independent task/activity paging, exact navigation and factual attribution are valuable improvements.

Across the freshly captured Projects, People and Repositories views, shared neutral cards, thin borders, text headings and framed references also dominate. People and Repositories already have secondary side regions: the issue is not that every view is literally one column. Missing recorded activity is a dataset limitation, not proof of inactivity or a reason to invent decorative content.

## What research should look for

1. **Visual encoding and preattentive scanning:** make state, hierarchy, sequence, time and relationship type distinguishable without reading every label. Study appropriate use of position, grouping, alignment, shape and restrained color, with accessible redundant labels.
2. **Information-dense application composition:** balance overview and detail, meaningful adjacent regions versus vertical reading, scan paths, and hierarchy within a selector/detail workspace. Preserve compactness without making every fact equally quiet.
3. **Semantic component differentiation:** status badges, counts, navigational links, confidence labels, participant references and repository identifiers should not all look like interchangeable outlined text. Teach when each treatment helps or misleads.
4. **Tasks and long prose:** distinguish concise identity from full statement, metadata and supporting context without silently truncating facts. Propose presentation patterns; do not assume separately authored short titles exist in storage.
5. **Plans and activity:** sequence/order/state can support visible step structures; timestamps can support aligned chronological rows. Research visualizations only when the actual data's scope and completeness justify them. A capped activity list is not a complete trend series; a plan is not a measured completion percentage.
6. **Progressive disclosure and discoverability:** reduce initial complexity without hiding everything that makes the dashboard useful for orientation. Explain tradeoffs using the current default and expanded Progress screenshots.
7. **Accessible interaction and verification:** status cannot depend on color alone; selected state, keyboard focus and factual status remain independent. Include contrast, real keyboard behavior, overflow and long-label testing, not screenshot aesthetics alone.

Useful search vocabulary includes visual information design, data-dense enterprise UI, dashboard information hierarchy, preattentive attributes, semantic status badges, master-detail interfaces, progressive disclosure, activity timeline design and accessible visual encoding. Prefer substantive application examples over decorative landing pages.

## Resource/skill evaluation rubric

For every recommended resource or skill, provide its exact URL/source, relevant section, the specific observed problem it teaches us to fix, a concrete application to this dashboard, tradeoffs and a way to verify the result. Distinguish principles from implementation recipes and illustrative examples from data-supported features.

Reject generic polish advice, framework tutorials without design judgment, invented metrics, gratuitous icons/charts, color-only meaning, and approaches that hide source facts to improve a screenshot. A skill should produce a repeatable inspect → hypothesis → bounded prototype → browser verification loop, not just aesthetic adjectives.

## Requested research deliverable

- A small ranked shortlist of relevant resources/skills with the rubric above, not a catalog dump.
- A diagnosis mapped to actual screenshot regions and current components.
- Two or three bounded presentation experiments, each naming the factual structure it improves, protected behavior, risks and observable success criteria.
- Separate changes achievable with current data from proposals requiring new authored fields or model/API changes.
- Explicit unresolved owner decisions and a recommended first experiment.

No implementation or skill installation is authorized by this research brief. The owner chooses a direction before source changes. No need to reopen installed-instance discovery or served acceptance merely to research the next preview iteration.

## Protected invariants and next checkpoint

Preserve the four views, exact entity navigation, full substantive text access, independent backend task/activity pagination, scoped optional plans, honest counts, explicit relationships, attribution/confidence, maintenance controls and keyboard operation. Do not infer child blockers from parent state, fabricate activity or copy relationships between scopes.

The next checkpoint is an evidence-backed research recommendation, followed by owner selection of a bounded prototype experiment. A successful experiment must improve scanning/recognition, not merely produce a prettier or less dense page. Evaluate with the same data, selected subject, viewport and disclosure state; inspect all sibling views using changed shared primitives. Mobile, dark theme and production acceptance remain separate scope decisions.
