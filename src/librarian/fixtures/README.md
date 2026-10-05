# Librarian fixture provenance

**Synthetic, labelled, deterministic. Not real research.** Every id (`FIX-…`), timestamp and string in
these files was fabricated for offline evaluation. No row was read from any database; no live, deployed or
credentialled access is performed; no model is invoked.

| File | Kind | Read by |
|---|---|---|
| `evaluation-dataset.json` | The seed: tables of synthetic rows (fixed ids, fixed timestamps) inserted into a temporary SQLite database built from the shipped migrations. | the fixture seeder |
| `candidate-inputs.json` | **Supplied** candidate outputs + conflict assessments — the assembler's input. Contains **no** expected outcomes. | the assembler path |
| `expected-outcomes.json` | The **oracle**: expected structural outcome + cited support per case, awaiting human review. | the evaluator, **only after assembly**, for comparison |

The oracle is never read by the builder/assembler path (`bun test src/librarian` asserts this). A
deterministic pass over these fixtures certifies structure — it is **not** a claim that any reading is
semantically useful or faithful, and it cannot catch an undeclared conflict. The semantic evaluation is a
separate, human-reviewed procedure; each case's `semantic.status` is `pending_human_review`.

The fixture exercises the F-1…F-20 adversarial branches of the offline implementation proposal
(`docs/librarian-reconciliation/OFFLINE-IMPLEMENTATION-PROPOSAL.md` §8). Problem-scoped steering is a
**coverage limitation**, never a fabricated projection: `FIX-ANN-PROBLEM-STEER` exists in the seed but is
not returned by `get_topic`.
