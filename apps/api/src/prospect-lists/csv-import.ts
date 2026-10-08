import { parseCsvRecords } from "../common/csv";

export { parseCsvRecords } from "../common/csv";

import type { RelationshipStageDto } from "./dto";
import { relationshipStages } from "./dto";

export interface ProspectImportRow {
  confidenceScore?: number;
  domain?: string;
  email?: string;
  entityId?: string;
  fitScore?: number;
  githubLogin?: string;
  linkedinUrl?: string;
  location?: string;
  name: string;
  notes?: string;
  orcidId?: string;
  relationshipStage: RelationshipStageDto;
  rowNumber: number;
  title?: string;
  type: "organization" | "person";
  websiteUrl?: string;
}

export interface ProspectImportParseResult {
  errors: Array<{
    message: string;
    row: number;
  }>;
  rows: ProspectImportRow[];
}

const recognizedHeaders = new Set([
  "confidence_score",
  "domain",
  "email",
  "entity_id",
  "fit_score",
  "github_login",
  "linkedin_url",
  "location",
  "name",
  "notes",
  "orcid_id",
  "relationship_stage",
  "title",
  "type",
  "website_url",
]);

export function parseProspectCsv(csvText: string): ProspectImportParseResult {
  const records = parseCsvRecords(csvText.replace(/^\uFEFF/, ""));
  if (records.length === 0) {
    return {
      errors: [{ message: "CSV file is empty", row: 1 }],
      rows: [],
    };
  }

  const headers = records[0]!.map(normalizeHeader);
  const errors: ProspectImportParseResult["errors"] = [];
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) {
    errors.push({
      message: `Duplicate headers: ${[...new Set(duplicateHeaders)].join(", ")}`,
      row: 1,
    });
  }

  const unknownHeaders = headers.filter((header) => header && !recognizedHeaders.has(header));
  if (unknownHeaders.length > 0) {
    errors.push({
      message: `Unknown headers: ${unknownHeaders.join(", ")}`,
      row: 1,
    });
  }

  if (!headers.includes("name") && !headers.includes("entity_id")) {
    errors.push({ message: "CSV requires a name or entity_id column", row: 1 });
  }

  if (errors.length > 0) {
    return { errors, rows: [] };
  }

  const rows: ProspectImportRow[] = [];
  records.slice(1).forEach((record, index) => {
    const rowNumber = index + 2;
    if (record.every((value) => value.trim().length === 0)) {
      return;
    }

    if (record.length > headers.length) {
      errors.push({ message: "Row has more values than the header", row: rowNumber });
      return;
    }

    const values = Object.fromEntries(
      headers.map((header, headerIndex) => [header, record[headerIndex]?.trim() ?? ""]),
    );
    const name = values.name ?? "";
    const entityId = optional(values.entity_id);
    if (!name && !entityId) {
      errors.push({ message: "Name is required when entity_id is not provided", row: rowNumber });
      return;
    }

    const type = values.type || "person";
    if (!isEntityType(type)) {
      errors.push({ message: "Type must be person or organization", row: rowNumber });
      return;
    }

    const relationshipStage = values.relationship_stage || "prospect";
    if (!isRelationshipStage(relationshipStage)) {
      errors.push({
        message: `Invalid relationship_stage: ${relationshipStage}`,
        row: rowNumber,
      });
      return;
    }

    const fitScore = parseScore(values.fit_score, "fit_score", rowNumber, errors);
    const confidenceScore = parseScore(
      values.confidence_score,
      "confidence_score",
      rowNumber,
      errors,
    );
    if (errors.some((error) => error.row === rowNumber)) {
      return;
    }

    rows.push({
      confidenceScore,
      domain: optional(values.domain),
      email: optional(values.email)?.toLowerCase(),
      entityId,
      fitScore,
      githubLogin: optional(values.github_login),
      linkedinUrl: optional(values.linkedin_url),
      location: optional(values.location),
      name: name || entityId || "Imported prospect",
      notes: optional(values.notes),
      orcidId: optional(values.orcid_id),
      relationshipStage,
      rowNumber,
      title: optional(values.title),
      type,
      websiteUrl: optional(values.website_url),
    });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ message: "CSV has no prospect rows", row: 2 });
  }

  return { errors, rows };
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function optional(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseScore(
  value: string | undefined,
  field: string,
  row: number,
  errors: ProspectImportParseResult["errors"],
): number | undefined {
  if (!value) {
    return undefined;
  }

  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    errors.push({ message: `${field} must be a number from 0 to 1`, row });
    return undefined;
  }

  return score;
}

function isEntityType(value: string): value is ProspectImportRow["type"] {
  return value === "person" || value === "organization";
}

function isRelationshipStage(value: string): value is RelationshipStageDto {
  return relationshipStages.some((stage) => stage === value);
}
