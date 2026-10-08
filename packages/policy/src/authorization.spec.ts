import { describe, expect, it } from "vitest";

import { canPerformWorkspaceAction, hasMinimumWorkspaceRole } from "./index";

describe("workspace authorization helpers", () => {
  it("compares role hierarchy", () => {
    expect(hasMinimumWorkspaceRole("owner", "admin")).toBe(true);
    expect(hasMinimumWorkspaceRole("viewer", "member")).toBe(false);
  });

  it("allows every workspace reader to submit AI quality feedback", () => {
    expect(canPerformWorkspaceAction("member", "ai-feedback:write")).toBe(true);
    expect(canPerformWorkspaceAction("viewer", "ai-feedback:write")).toBe(true);
    expect(canPerformWorkspaceAction("compliance_reviewer", "ai-feedback:write")).toBe(true);
  });

  it("allows compliance reviewers to read audit events but not manage workspaces", () => {
    expect(canPerformWorkspaceAction("compliance_reviewer", "audit:read")).toBe(true);
    expect(canPerformWorkspaceAction("compliance_reviewer", "workspace:manage")).toBe(false);
  });

  it("allows members to curate prospect lists while keeping viewers read-only", () => {
    expect(canPerformWorkspaceAction("member", "prospect-list:read")).toBe(true);
    expect(canPerformWorkspaceAction("member", "prospect-list:write")).toBe(true);
    expect(canPerformWorkspaceAction("viewer", "prospect-list:read")).toBe(true);
    expect(canPerformWorkspaceAction("viewer", "prospect-list:write")).toBe(false);
  });

  it("allows draft review while reserving draft changes for collaborators", () => {
    expect(canPerformWorkspaceAction("member", "draft:read")).toBe(true);
    expect(canPerformWorkspaceAction("member", "draft:write")).toBe(true);
    expect(canPerformWorkspaceAction("compliance_reviewer", "draft:read")).toBe(true);
    expect(canPerformWorkspaceAction("viewer", "draft:write")).toBe(false);
  });
});

it("allows relationship-note collaboration without granting viewers write access", () => {
  expect(canPerformWorkspaceAction("member", "relationship-note:read")).toBe(true);
  expect(canPerformWorkspaceAction("member", "relationship-note:write")).toBe(true);
  expect(canPerformWorkspaceAction("compliance_reviewer", "relationship-note:read")).toBe(true);
  expect(canPerformWorkspaceAction("viewer", "relationship-note:write")).toBe(false);
});
