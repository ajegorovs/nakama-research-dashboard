# Required Fixtures and Edge States

The implementation should render both the real UDV corpus and a synthetic edge-state fixture set.

## Existing fixture states to preserve

1. **Blocked axis**
   - visibly exceptional;
   - blocker remains legible.

2. **Attention styling**
   - exceptional state can draw attention without turning the whole dashboard into warning UI.

3. **Many-axis topic**
   - at least five axes;
   - current topic view remains compact;
   - completed/secondary work can fold;
   - no duplicate disclosure controls.

4. **Evidence-free inferred axis**
   - axis exists;
   - claim confidence is inferred;
   - no fake evidence is invented.

5. **No current-state claim**
   - confidence should not default to confirmed merely because the entity exists.

6. **One person on multiple topics**
   - People view shows cross-topic involvement without duplication artifacts.

7. **Unattributable person/activity**
   - unknown attribution does not break layout;
   - do not invent a person.

## Additional v2 fixtures

### A. Usable but incomplete axis

Example: Acquisition automation.

Expected:

- status reads usable or equivalent;
- problem states remaining incompleteness;
- axis is not labeled completed;
- human note can state "good enough for current experiment";
- open problems remain visible.

### B. Reopened axis

History:

`active -> usable -> completed -> active`

Expected:

- current state is active;
- prior closure remains in history;
- reopened state is not treated as a new unrelated axis.

### C. Optional plan absent

Exploratory axis with no staged plan.

Expected:

- Progress layout remains coherent;
- no empty "Plan" card is rendered simply to satisfy a template.

### D. Optional plan present

Feature sprint with four plan steps and PR-backed activity.

Expected:

- plan expresses WHAT / WHY / HOW;
- PR/activity expresses current step;
- no duplication between plan step and raw activity feed.

### E. Problem spans multiple repositories

Expected:

- one Problem object;
- multiple repository tags/threads;
- no forced duplication into separate repo-owned axes.

### F. Repository supports multiple axes

Expected:

- Repository view lists all relevant axes;
- repo remains implementation surface;
- axis parentage remains with topics.

### G. Stale but healthy

No activity for >7 days, no blocker.

Expected:

- `[STALE]` shown;
- no blocked/stalled language;
- item remains navigable.

### H. Blocked and stale

Expected:

- both concepts can be represented;
- blocked is diagnosis/state;
- stale is recency observation;
- one does not overwrite the other.

### I. Dense tag set

Topic with multiple people and repositories.

Expected:

- tags wrap naturally;
- no information disappears;
- avoid premature "+N more" unless viewport/data proves necessary.

### J. 1280x800 Progress layout

Expected:

- Problem and Activity remain simultaneously visible side-by-side if practical;
- if stacked, Problem precedes Activity;
- secondary support sections follow;
- primary question and latest activity are reachable without pathological scrolling.
