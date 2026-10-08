import { describe, expect, it } from "vitest";

import { parseCsvRecords, parseProspectCsv } from "./csv-import";

describe("prospect CSV import", () => {
  it("parses quoted commas and escaped quotes", () => {
    expect(parseCsvRecords('name,notes\r\n"Ada, Countess","Said ""hello"""')).toEqual([
      ["name", "notes"],
      ["Ada, Countess", 'Said "hello"'],
    ]);
  });

  it("normalizes supported headers and applies safe defaults", () => {
    const result = parseProspectCsv(
      "Name,Type,Relationship Stage,Fit Score,Email\nAda Lovelace,person,warm,0.82,ADA@example.com",
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      expect.objectContaining({
        email: "ada@example.com",
        fitScore: 0.82,
        name: "Ada Lovelace",
        relationshipStage: "warm",
        rowNumber: 2,
        type: "person",
      }),
    ]);
  });

  it("reports row-level validation errors before importing", () => {
    const result = parseProspectCsv(
      "name,type,relationship_stage,confidence_score\nAda,robot,prospect,2\nGrace,person,invalid,0.8",
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      { message: "Type must be person or organization", row: 2 },
      { message: "Invalid relationship_stage: invalid", row: 3 },
    ]);
  });
});
