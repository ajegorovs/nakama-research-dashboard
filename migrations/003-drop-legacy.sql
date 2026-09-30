-- 003-drop-legacy.sql — retire the generation-1 tables.
--
-- 002 moved generation 1 aside (`projects` → `projects_v1`, `activities` → `activities_v1`) and copied
-- every row into the coordination model, leaving the originals behind on purpose so the upgrade could be
-- checked against them. That check is done: nothing reads them any more. A search over `src/`, `scripts/`,
-- `docs/` and the shipped skill finds them only in 001 (which creates them), 002 (which moves and copies
-- them) and the migration tests (which exercise exactly that path).
--
-- So this is the point where the legacy copy genuinely disappears. A pre-003 copy of a live database is
-- kept outside the tree (under `<data-root>/backups/`) because after this migration those rows exist
-- nowhere else.
--
-- Forward-only, like 001 and 002: never edit this file once it has been applied anywhere.
--
-- `activities_v1` first: it carries the foreign key to `projects_v1`, so dropping the child first keeps
-- the drop order valid under `PRAGMA foreign_keys=ON`.
DROP TABLE IF EXISTS activities_v1;
DROP TABLE IF EXISTS projects_v1;
