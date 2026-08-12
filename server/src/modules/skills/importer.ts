import type { ImportSkillFileInput, ImportSkillInput, Skill } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  IMPORT_ALLOWED_EXTENSIONS,
  IMPORT_ALLOWED_PROTOCOLS,
  IMPORT_MAX_BYTES,
  IMPORT_TIMEOUT_MS,
  MAX_SKILL_BODY_CHARS,
} from './constants.js';
import { basenameWithoutExtension, deriveSkillMeta } from './helpers.js';
import type { SkillsWriter } from './writer.js';

/**
 * Import a skill body — from a URL the server fetches, or from a file the client
 * read off disk and posted as text.
 *
 * Three things are deliberate here, and each is the reason import was held out
 * of `specs/02-skills.md` v1:
 *
 * - **The fetch is a seam, not a hardcoded global.** `fetchImpl` defaults to the
 *   platform `fetch` and is replaced in tests, so the import path is testable
 *   without a network.
 * - **The response is bounded before it is read as text**, by both declared
 *   length and a hard read cap, and by the same body limit a hand-written skill
 *   has. An unbounded remote document is not an input we accept.
 * - **The result is stored as `source: 'imported_url'`,** which is what makes the
 *   assembler wrap it as untrusted. That flag is the whole security story; do not
 *   let an import path write `'manual'`.
 *
 * The file path shares the last of those three and none of the first two: it has
 * nothing to fetch, so it has no seam and no network limits — only the same body
 * cap and the same untrusted source flag.
 *
 * SSRF: only http/https, and hosts that are obviously internal are refused. This
 * is a literal check, not a resolver — enough to stop a pasted
 * `http://localhost:3001/...`, not a substitute for an egress policy if this ever
 * runs somewhere multi-tenant.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const INTERNAL_HOST = /^(localhost|127\.|0\.0\.0\.0|::1|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i;

export class SkillImporter {
  constructor(
    private writer: SkillsWriter,
    private fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  async importFromUrl(workspaceId: string, input: ImportSkillInput): Promise<Skill> {
    const url = this.assertFetchableUrl(input.url);
    const text = await this.fetchText(url);

    if (text.trim() === '') {
      throw new ValidationError('The imported document is empty.', { url });
    }
    if (text.length > MAX_SKILL_BODY_CHARS) {
      throw new ValidationError(
        `Imported body is ${text.length} characters; the limit is ${MAX_SKILL_BODY_CHARS}.`,
        { limit: MAX_SKILL_BODY_CHARS, actual: text.length },
      );
    }

    const derived = deriveSkillMeta(text, {
      fallbackName: basenameWithoutExtension(new URL(url).pathname) ?? 'imported-skill',
      label: url,
    });

    return this.writer.create(
      workspaceId,
      {
        name: input.name ?? derived.name,
        description: input.description ?? derived.description,
        type: input.type ?? 'custom',
        body: text,
        enabled: true,
      },
      { source: 'imported_url' },
    );
  }

  /**
   * Store a body the client read off the user's disk.
   *
   * There is no I/O here on purpose: the browser already has the text, so it
   * posts it and the server never touches a filesystem or a multipart parser.
   * `filename` is validated and used for naming, never for a path — nothing on
   * this path opens, joins or writes it, so a `../` in it is inert.
   *
   * `source: 'imported_file'`, not `'manual'`: picking a file is not authoring
   * one. A skill downloaded from a gist and saved to disk is exactly as external
   * as one fetched over HTTP, and the assembler must wrap both.
   */
  async importFromFile(workspaceId: string, input: ImportSkillFileInput): Promise<Skill> {
    const filename = input.filename.trim();
    const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    if (!IMPORT_ALLOWED_EXTENSIONS.includes(extension as (typeof IMPORT_ALLOWED_EXTENSIONS)[number])) {
      throw new ValidationError(
        `Only ${IMPORT_ALLOWED_EXTENSIONS.join(', ')} files can be imported.`,
        { filename, allowed: IMPORT_ALLOWED_EXTENSIONS },
      );
    }

    const text = input.body;
    if (text.trim() === '') {
      throw new ValidationError('The selected file is empty.', { filename });
    }
    if (text.length > MAX_SKILL_BODY_CHARS) {
      throw new ValidationError(
        `File body is ${text.length} characters; the limit is ${MAX_SKILL_BODY_CHARS}.`,
        { limit: MAX_SKILL_BODY_CHARS, actual: text.length },
      );
    }

    const derived = deriveSkillMeta(text, {
      fallbackName: basenameWithoutExtension(filename) ?? 'imported-skill',
      label: filename,
    });

    return this.writer.create(
      workspaceId,
      {
        name: input.name ?? derived.name,
        description: input.description ?? derived.description,
        type: input.type ?? 'custom',
        body: text,
        enabled: true,
      },
      { source: 'imported_file' },
    );
  }

  private assertFetchableUrl(raw: string): string {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new ValidationError('Not a valid URL.', { url: raw });
    }
    if (!IMPORT_ALLOWED_PROTOCOLS.includes(parsed.protocol as 'http:' | 'https:')) {
      throw new ValidationError('Only http(s) URLs can be imported.', { url: raw });
    }
    if (INTERNAL_HOST.test(parsed.hostname)) {
      throw new ValidationError('Refusing to fetch an internal address.', { url: raw });
    }
    return parsed.toString();
  }

  private async fetchText(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { accept: 'text/markdown, text/plain, text/*;q=0.9' },
      });
      if (!res.ok) {
        throw new ValidationError(`Fetch failed with HTTP ${res.status}.`, { url });
      }
      const declared = Number(res.headers.get('content-length') ?? '0');
      if (declared > IMPORT_MAX_BYTES) {
        throw new ValidationError(`Document is larger than ${IMPORT_MAX_BYTES} bytes.`, { url });
      }
      const text = await res.text();
      // Declared length can lie or be absent; the read result is what counts.
      return text.slice(0, IMPORT_MAX_BYTES);
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      throw new ValidationError(`Could not fetch the skill: ${reason}`, { url });
    } finally {
      clearTimeout(timer);
    }
  }
}
