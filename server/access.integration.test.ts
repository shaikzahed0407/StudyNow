import { afterEach, describe, expect, it } from "vitest";
import { classStudents, classes, noteChunks, noteFiles, notes, savedResources, teacherResources } from "../drizzle/schema";
import { getAuthorizedChunks, getPublishedResource, setDbForTests } from "./db";

class QueryFixture {
  private source: unknown;
  private joined: unknown[] = [];
  constructor(private readonly db: RelationalFixture) {}
  from(source: unknown) { this.source = source; return this; }
  innerJoin(source: unknown) { this.joined.push(source); return this; }
  where() { return this; }
  limit() { return this; }
  orderBy() { return this; }
  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(this.db.rowsFor(this.source, this.joined)).then(resolve, reject); }
}

class RelationalFixture {
  studentId = 42;
  mode: "assigned" | "unassigned" | "unpublished" = "assigned";
  select() { return new QueryFixture(this); }
  rowsFor(source: unknown, joined: unknown[] = []) {
    if (source === classStudents) return this.mode === "unassigned" ? [] : [{ classId: 7, studentId: this.studentId }];
    if (source === teacherResources) return [{ id: 10, teacherId: 21, classId: 7, subjectId: 100, noteId: 2, title: "Algorithms handout", status: this.mode === "unpublished" ? "unpublished" : "published" }];
    if (source === notes) return [{ id: 1, ownerId: this.studentId }];
    if (source === savedResources && joined.includes(teacherResources) && joined.includes(classStudents)) return [{ noteId: 2 }];
    if (source === noteChunks) return [{ id: 101, noteId: 1, pageRef: "Page 1", content: "Private owned content", isActive: 1 }, { id: 102, noteId: 2, pageRef: "Slide 2", content: "Explicitly saved class content", isActive: 1 }];
    if (source === noteFiles || source === classes) return [];
    return [];
  }
}

describe("real backend access helper flow", () => {
  const fixture = new RelationalFixture();

  afterEach(() => setDbForTests(null));

  it("returns an assigned published resource and denies an unassigned student", async () => {
    setDbForTests(fixture as any);
    fixture.studentId = 42;
    fixture.mode = "assigned";
    await expect(getPublishedResource(10, 42)).resolves.toMatchObject({ resource: { id: 10, status: "published", classId: 7 } });

    fixture.studentId = 43;
    fixture.mode = "unassigned";
    await expect(getPublishedResource(10, 43)).resolves.toBeNull();
  });

  it("denies an unpublished resource even when the student remains assigned", async () => {
    setDbForTests(fixture as any);
    fixture.studentId = 42;
    fixture.mode = "unpublished";
    await expect(getPublishedResource(10, 42)).resolves.toBeNull();
  });

  it("returns only owned and explicitly saved note chunks through the real authorized-chunk helper", async () => {
    setDbForTests(fixture as any);
    fixture.studentId = 42;
    fixture.mode = "assigned";
    const chunks = await getAuthorizedChunks(42);
    expect(chunks.map(chunk => chunk.noteId)).toEqual([1, 2]);
    expect(chunks.map(chunk => chunk.content)).not.toContain("Denied public-only content");
  });
});
