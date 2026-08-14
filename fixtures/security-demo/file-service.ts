/**
 * SECURITY DEMO FIXTURE — DELIBERATELY VULNERABLE. DO NOT COPY, DO NOT SHIP.
 * See ./README.md. Nothing imports this file and nothing may.
 *
 * Planted: path traversal, command injection.
 */
import { readFile, unlink } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { join } from 'node:path';

const UPLOAD_ROOT = '/var/app/uploads';

/**
 * Defect 4 — path traversal. `join` resolves `..`, so a name of
 * `../../../../etc/passwd` walks straight out of UPLOAD_ROOT. The fix is to
 * resolve first and then verify the result is still inside the root — checking
 * the input for `..` is the wrong layer and misses encoded forms.
 */
export async function readUpload(fileName: string): Promise<Buffer> {
  return readFile(join(UPLOAD_ROOT, fileName));
}

/** Same defect with a delete behind it, so the blast radius is destruction rather than disclosure. */
export async function deleteUpload(fileName: string): Promise<void> {
  await unlink(join(UPLOAD_ROOT, fileName));
}

/**
 * Defect 5 — command injection. `exec` runs a shell, so anything in
 * `archiveName` after a `;` or `&&` runs too. Even with the quotes below, a
 * single `'` closes them and the rest is the attacker's.
 */
export function archiveUploads(archiveName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`tar -czf '${archiveName}.tar.gz' ${UPLOAD_ROOT}`, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** And once more via a "convenience" wrapper, which is how these usually survive review. */
export function inspectUpload(fileName: string): Promise<string> {
  return new Promise((resolve) => {
    exec(`file ${join(UPLOAD_ROOT, fileName)}`, (_err, stdout) => resolve(stdout));
  });
}
