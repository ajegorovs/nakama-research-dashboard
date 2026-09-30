import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ResearchStore } from "./store";

const migration = readFileSync(
  join(import.meta.dir, "../migrations/001-research.sql"),
  "utf8"
);

function store(): ResearchStore {
  const path = `${process.env.TMPDIR ?? "/tmp"}/research-store-test-${crypto.randomUUID()}.sqlite`;
  const seeded = new Database(path);
  seeded.exec(migration);
  seeded.close();
  return new ResearchStore(path);
}

describe("ResearchStore", () => {
  test("creates and lists projects newest first", () => {
    const subject = store();
    try {
      const first = subject.createProject({ name: "Topic Alpha" });
      const second = subject.createProject({
        name: "OpenFOAM validation",
        status: "paused",
      });

      const all = subject.listProjects();
      expect(all).toHaveLength(2);
      expect(all.map((project) => project.id)).toContain(first.id);
      expect(subject.listProjects("paused").map((p) => p.id)).toEqual([
        second.id,
      ]);
    } finally {
      subject.close();
    }
  });

  test("updates only the fields it is given", () => {
    const subject = store();
    try {
      const project = subject.createProject({
        description: "sweep",
        name: "COMSOL DoE",
      });
      const updated = subject.updateProject(project.id, { status: "done" });
      expect(updated.status).toBe("done");
      expect(updated.description).toBe("sweep");
      expect(updated.summary).toBe("");
    } finally {
      subject.close();
    }
  });

  test("rejects a patch for a missing project", () => {
    const subject = store();
    try {
      expect(() => subject.updateProject("nope", { name: "x" })).toThrow(
        "Project not found."
      );
    } finally {
      subject.close();
    }
  });

  test("records activity with provenance and filters by project", () => {
    const subject = store();
    try {
      const project = subject.createProject({ name: "Topic Alpha" });
      const other = subject.createProject({ name: "COMSOL DoE" });
      subject.addActivity({
        projectId: project.id,
        sourceRef: "PR #72",
        sourceType: "github_pr",
        summary: "PR #72 merged",
      });
      subject.addActivity({ projectId: other.id, summary: "run 41 finished" });

      const scoped = subject.listActivity(project.id);
      expect(scoped).toHaveLength(1);
      expect(scoped[0]?.summary).toBe("PR #72 merged");
      expect(scoped[0]?.sourceRef).toBe("PR #72");
      expect(subject.listActivity()).toHaveLength(2);
      expect(() =>
        subject.addActivity({ projectId: "missing", summary: "x" })
      ).toThrow("Project not found.");
    } finally {
      subject.close();
    }
  });
});
