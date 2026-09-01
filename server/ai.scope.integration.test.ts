import { afterEach, describe, expect, it, vi } from "vitest";
import { aiConversations, aiQuestions, aiAnswerSources, classStudents, noteChunks, noteVisuals, notes, savedResources, teacherResources } from "../drizzle/schema";
import { setDbForTests } from "./db";
import type { TrpcContext } from "./_core/context";

const llmMocks = vi.hoisted(() => ({ listLLMModels: vi.fn(), invokeLLM: vi.fn() }));
vi.mock("./_core/llm", () => llmMocks);

import { appRouter } from "./routers";

class QueryFixture {
  private source: unknown;
  private selection: unknown;
  private joins: unknown[] = [];
  constructor(private readonly db: AiRelationalFixture) {}
  from(source: unknown) { this.source = source; return this; }
  innerJoin(source: unknown) { this.joins.push(source); return this; }
  where() { return this; }
  limit() { return this; }
  orderBy() { return this; }
  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(this.db.rowsFor(this.source, this.selection, this.joins)).then(resolve, reject); }
  setSelection(selection: unknown) { this.selection = selection; return this; }
}

class AiRelationalFixture {
  savedAnswerSourceRows: unknown[] = [];
  allChunks = [
    { id: 101, noteId: 1, pageRef: "Page 1", content: "Private owned content about binary search", keywords: "binary search", isActive: 1 },
    { id: 102, noteId: 2, pageRef: "Slide 2", content: "Explicitly saved class content about binary search", keywords: "binary search", isActive: 1 },
    { id: 103, noteId: 3, pageRef: "Page 9", content: "Denied public-only content about binary search", keywords: "binary search", isActive: 1 },
  ];
  select(selection?: unknown) { const query = new QueryFixture(this); return query.setSelection(selection); }
  insert(table: unknown) {
    return {
      values: (values: unknown) => {
        if (table === aiAnswerSources) this.savedAnswerSourceRows.push(values);
        const inserted = [{ id: table === aiConversations ? 77 : table === aiQuestions ? 88 : table === aiAnswerSources ? 99 : 1 }];
        return {
          returning: () => Promise.resolve(inserted),
          then: (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) => Promise.resolve(inserted).then(resolve, reject),
        };
      },
    };
  }
  rowsFor(source: unknown, selection?: unknown, joins: unknown[] = []) {
    if (source === classStudents) return [{ classId: 7, studentId: 42 }];
    if (source === savedResources && joins.includes(teacherResources) && joins.includes(classStudents)) return [{ noteId: 2 }];
    if (source === notes && selection) return [{ id: 1 }];
    if (source === notes) return [{ id: 1, title: "Private algorithms note" }, { id: 2, title: "Saved class algorithms note" }];
    if (source === noteChunks) return this.allChunks;
    if (source === noteVisuals) return [];
    return [];
  }
}

function contextForStudent(): TrpcContext {
  return {
    user: { id: 42, openId: "ai-scope-student", name: "Scope Student", email: "scope@example.com", loginMethod: "test", role: "student", status: "active", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("real ai.ask authorization flow", () => {
  const fixture = new AiRelationalFixture();

  afterEach(() => setDbForTests(null));

  it("passes only owned and explicitly saved chunks to the model and answer citations", async () => {
    setDbForTests(fixture as any);
    llmMocks.listLLMModels.mockResolvedValue({ data: [{ id: "gpt-5-mini" }] });
    llmMocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: "Binary search repeatedly halves its authorized search space." } }] });
    const response = await appRouter.createCaller(contextForStudent()).ai.ask({ question: "How does binary search work?" });

    expect(response.foundInNotes).toBe(true);
    expect(response.sources.map(source => source.noteId)).toEqual([1, 2]);
    const request = llmMocks.invokeLLM.mock.calls[0]?.[0];
    expect(request.messages[1].content).toContain("Private algorithms note");
    expect(request.messages[1].content).toContain("Saved class algorithms note");
    expect(request.messages[1].content).not.toContain("Denied public-only content");
    const persistedSources = (fixture.savedAnswerSourceRows[0] as Array<{ noteId: number }> | undefined) || [];
    expect(persistedSources.map(source => source.noteId)).toEqual([1, 2]);
    expect(persistedSources.map(source => source.noteId)).not.toContain(3);
  });
});
