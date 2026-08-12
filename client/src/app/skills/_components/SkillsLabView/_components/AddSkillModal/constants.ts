/** Constants for AddSkillModal. */

import type { SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import type { AddSkillTab } from "./helpers";

/** Modal width, matching the create-agent modal so the two read as one family. */
export const MODAL_WIDTH = 640;

/** Type options offered on create. Mirrors the `SkillType` enum in @devdigest/shared. */
export const TYPE_OPTIONS: SkillType[] = ["rubric", "convention", "security", "custom"];

/** Default type: "custom" claims the least about a body nobody has written yet. */
export const DEFAULT_TYPE: SkillType = "custom";

/** Rows in the body textarea — tall enough to see a short rule whole. */
export const BODY_ROWS = 10;

/**
 * Extensions the file tab accepts, mirroring `IMPORT_ALLOWED_EXTENSIONS` on the
 * server, which is the authority — this copy only narrows the file dialog and
 * fails fast.
 *
 * `.zip` is deliberately absent. A skill is one `body` string, so a bundle has
 * nowhere to be stored, and unpacking one would add zip-bomb and entry-path
 * handling to a path whose whole value is that it does no file I/O at all.
 */
export const IMPORT_ACCEPT_EXTENSIONS = [".md", ".mdx", ".txt"] as const;

/**
 * The three origins, in the order they appear as tabs. Labels are not here —
 * they come from `next-intl` at render time, so this list carries only what a
 * translation cannot supply.
 */
export const TABS: { key: AddSkillTab; icon: IconName }[] = [
  { key: "create", icon: "Plus" },
  { key: "file", icon: "FileText" },
  { key: "url", icon: "Link" },
];
