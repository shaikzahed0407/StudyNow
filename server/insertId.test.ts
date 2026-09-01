import { describe, expect, it } from "vitest";
import { getInsertId } from "./db";

describe("getInsertId", () => {
  it("reads insertId from the real mysql2 tuple shape [ResultSetHeader, FieldPacket[]]", () => {
    // This is what drizzle-orm/mysql2 actually resolves an INSERT to.
    // Reading `result.insertId` directly (the original bug) returns
    // undefined here because `result` is an array, not the header object.
    const mysql2Result = [{ insertId: 42, affectedRows: 1, fieldCount: 0 }, []];
    expect(getInsertId(mysql2Result)).toBe(42);
  });

  it("reads insertId from a plain object shape (e.g. test doubles)", () => {
    expect(getInsertId({ insertId: 7 })).toBe(7);
  });

  it("throws instead of silently returning NaN when insertId is missing", () => {
    expect(() => getInsertId([{ affectedRows: 1 }, []])).toThrow();
    expect(() => getInsertId({})).toThrow();
    expect(() => getInsertId(undefined)).toThrow();
  });

  it("throws on a zero or negative insertId rather than treating it as valid", () => {
    expect(() => getInsertId({ insertId: 0 })).toThrow();
    expect(() => getInsertId([{ insertId: -1 }, []])).toThrow();
  });
});
