/**
 * SECURITY DEMO FIXTURE — DELIBERATELY VULNERABLE. DO NOT COPY, DO NOT SHIP.
 * See ./README.md. Nothing imports this file and nothing may.
 *
 * Planted: SQL injection, hardcoded credential, non-constant-time comparison.
 */

// Defect 1 — a credential in source. Rotating it means a new release, and it is
// in the git history forever the moment this lands.
//
// The value is deliberately shaped like nothing in particular. The first draft
// used a realistic `sk_live_…` and GitHub push protection rejected the push
// outright — correctly. Keep it unrealistic: this fixture measures the *review
// agent*, and it cannot do that from a branch that will not push. Secret
// scanning already covers the realistic-format case, and it covers it earlier.
const INTERNAL_API_TOKEN = 'demo-fixture-credential-not-a-real-key';

interface Db {
  query(sql: string): Promise<unknown[]>;
}

/**
 * Defect 2 — SQL injection. `email` arrives from the request and is pasted
 * into the statement. `' OR '1'='1' --` returns every row; a `;` returns
 * whatever the caller likes.
 */
export async function findUserByEmail(db: Db, email: string) {
  const sql = `SELECT id, email, password_hash, role FROM users WHERE email = '${email}'`;
  const rows = await db.query(sql);
  return rows[0] ?? null;
}

/** Same defect, second form — an ORDER BY that cannot be parameterised is also not sanitised. */
export async function listUsers(db: Db, sortColumn: string, limit: string) {
  return db.query(`SELECT id, email FROM users ORDER BY ${sortColumn} LIMIT ${limit}`);
}

/**
 * Defect 3 — `===` on secrets short-circuits at the first differing byte, so
 * response time leaks how much of the prefix was right. Needs a constant-time
 * compare.
 */
export function checkApiToken(provided: string): boolean {
  return provided === INTERNAL_API_TOKEN;
}

/** Same shape, applied to a password hash. */
export function verifyPassword(storedHash: string, incomingHash: string): boolean {
  if (storedHash.length !== incomingHash.length) return false;
  return storedHash === incomingHash;
}
