# Security demo fixture — DELIBERATELY VULNERABLE, DO NOT SHIP

Every file in this directory contains **intentional security defects**. They
exist so DevDigest's own Security Reviewer has something real to find: a review
that returns "no findings" against clean code proves nothing about the reviewer.

**Nothing here is reachable from the product.** This directory sits outside every
package: it is in no `tsconfig` `include`, no test glob, no
`dependency-cruiser` scan and no build. Nothing imports it, and nothing can —
that is the point of the location, not an accident of it.

## What is planted, and what should be found

| File | Defect | Severity we expect |
| --- | --- | --- |
| `user-lookup.ts` | SQL built by string concatenation from a request value | CRITICAL |
| `user-lookup.ts` | API token hardcoded in source | CRITICAL |
| `user-lookup.ts` | Password compared with `===` in non-constant time | WARNING |
| `file-service.ts` | Path traversal — user input joined into a filesystem path unchecked | CRITICAL |
| `file-service.ts` | Shell command built by interpolation | CRITICAL |
| `admin-routes.ts` | Destructive endpoint with no authorization check | CRITICAL |
| `admin-routes.ts` | Secrets written to the log | WARNING |
| `admin-routes.ts` | Error handler returning the raw stack to the client | SUGGESTION |

Eight defects across three files. Use it as a scorecard: a reviewer that finds
two of eight is telling you something about the reviewer, not about the code.

## Using it

```sh
# through the MCP server
run_agent_on_pull_request  repo: AIengineerDev/dev-digest  pr: <n>  agent: Security Reviewer
```

If you add a defect here, add its row above. The table is what makes this
fixture a measurement rather than a pile of bad code.

## Do not make the planted secret realistic

The first version of `user-lookup.ts` used an `sk_live_…`-shaped token and
GitHub push protection rejected the push — correctly, and before any reviewer
saw the branch. Keep planted credentials shaped like nothing in particular.

This is not a limitation to work around. Secret scanning catches the
realistic-format case at push time, which is earlier and cheaper than review;
what this fixture measures is whether the *review agent* recognises a
credential pinned in source at all. If you find yourself reaching for the
"allow this secret" button to land a fixture, you are training the wrong habit
and disabling a control that just worked.
