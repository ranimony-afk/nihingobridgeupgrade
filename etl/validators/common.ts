/**
 * Common validation rules for ETL data.
 * Every record is validated before database write.
 */

import type { ValidationError } from "../types";

/** Validate a required non-empty string field. */
export function requireString(
  sourceId: string,
  field: string,
  value: unknown,
): ValidationError | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { sourceId, field, message: `${field} is required and must be a non-empty string`, value };
  }
  return null;
}

/** Validate an optional integer within range. */
export function optionalIntRange(
  sourceId: string,
  field: string,
  value: unknown,
  min: number,
  max: number,
): ValidationError | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    return { sourceId, field, message: `${field} must be an integer between ${min} and ${max}`, value };
  }
  return null;
}

/** Validate JLPT level (1–5 or null). */
export function validateJlptLevel(
  sourceId: string,
  value: unknown,
): ValidationError | null {
  return optionalIntRange(sourceId, "jlptLevel", value, 1, 5);
}

/** Validate that an array has at least one element. */
export function requireNonEmptyArray(
  sourceId: string,
  field: string,
  value: unknown,
): ValidationError | null {
  if (!Array.isArray(value) || value.length === 0) {
    return { sourceId, field, message: `${field} must be a non-empty array`, value };
  }
  return null;
}

/** Run all validators and collect errors. */
export function validate(
  checks: Array<ValidationError | null>,
): ValidationError[] {
  return checks.filter((e): e is ValidationError => e !== null);
}
