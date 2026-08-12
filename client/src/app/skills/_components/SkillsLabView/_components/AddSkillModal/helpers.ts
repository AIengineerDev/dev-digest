import { ApiError } from "../../../../../../lib/api";
import { IMPORT_ACCEPT_EXTENSIONS } from "./constants";

/** Pure helpers for AddSkillModal. No React. */

/** Which origin the modal is collecting a skill from. */
export type AddSkillTab = "create" | "file" | "url";

/**
 * The server's message when it sent one, the caller's generic string otherwise.
 *
 * Every refusal on the import paths is a statement about the input the user just
 * gave — an internal host, an oversized document, a `.pdf` — and a fixed
 * "Could not import the skill." throws all of that away. A previous version of
 * the conventions screen did exactly that and made a routine 422 unreadable.
 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}

/** `accept` value for the file input, from the one list of allowed extensions. */
export const FILE_ACCEPT = IMPORT_ACCEPT_EXTENSIONS.join(",");

/**
 * Reject a file by extension before reading it.
 *
 * The server checks this too and is the authority; doing it here as well saves a
 * round-trip and is the only check that can happen before a large file is read
 * into memory. `accept` on the input is a filter, not a guarantee — a user can
 * still choose "All files".
 */
export function isAllowedFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  return IMPORT_ACCEPT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
