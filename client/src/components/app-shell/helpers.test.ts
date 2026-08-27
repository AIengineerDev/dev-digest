import { describe, it, expect } from "vitest";
import { activeKeyFor, isTextInput, toShellRepo } from "./helpers";

describe("activeKeyFor", () => {
  it("maps the tour route to onboarding-tour (R20)", () => {
    expect(activeKeyFor("/repos/x/tour")).toBe("onboarding-tour");
  });

  it("no longer maps the add-repository wizard to onboarding-tour (R20 defect fix)", () => {
    // /onboarding is the add-repository first-run wizard, a different screen —
    // it must not steal the tour's nav key any more.
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).toBe("");
  });

  it("maps context and conventions unaffected by the /tour repoint", () => {
    expect(activeKeyFor("/repos/x/context")).toBe("context");
    expect(activeKeyFor("/repos/x/conventions")).toBe("conventions");
  });

  it("maps pulls, settings and the skills-lab routes", () => {
    expect(activeKeyFor("/repos/x/pulls")).toBe("pulls");
    expect(activeKeyFor("/settings/api-keys")).toBe("settings");
    expect(activeKeyFor("/skills")).toBe("skills");
    expect(activeKeyFor("/agents")).toBe("agents");
  });

  it("maps multi-agent, eval, memory, agent-performance and ci-runs", () => {
    expect(activeKeyFor("/multi-agent")).toBe("multi-agent");
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/memory")).toBe("memory");
    expect(activeKeyFor("/agent-performance")).toBe("agent-performance");
    expect(activeKeyFor("/ci-runs")).toBe("ci-runs");
  });

  it("returns an empty string for an unrecognized path", () => {
    expect(activeKeyFor("/something-else")).toBe("");
  });
});

describe("isTextInput", () => {
  it("recognizes INPUT, TEXTAREA and contentEditable elements", () => {
    expect(isTextInput(document.createElement("input"))).toBe(true);
    expect(isTextInput(document.createElement("textarea"))).toBe(true);
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTextInput(div)).toBe(true);
  });

  it("is false for a non-text element and for null", () => {
    // jsdom's `isContentEditable` on a plain element is `undefined`, not
    // `false` — isTextInput's `||` chain returns that raw value rather than
    // coercing it, so the falsy check (not a strict `false`) is what holds.
    expect(isTextInput(document.createElement("button"))).toBeFalsy();
    expect(isTextInput(null)).toBeFalsy();
  });
});

describe("toShellRepo", () => {
  it("maps a lib Repo to the shell's RepoSummary shape", () => {
    const repo = {
      id: "r1",
      workspace_id: "w1",
      owner: "acme",
      name: "payments-api",
      full_name: "acme/payments-api",
      default_branch: "main",
      clone_path: "/clones/r1",
      last_polled_at: "2026-08-01T00:00:00.000Z",
      created_by: null,
    };
    expect(toShellRepo(repo)).toEqual({
      id: "r1",
      full_name: "acme/payments-api",
      default_branch: "main",
      syncedLabel: "synced",
    });
  });

  it("reports 'not synced' when last_polled_at is null", () => {
    const repo = {
      id: "r1",
      workspace_id: "w1",
      owner: "acme",
      name: "payments-api",
      full_name: "acme/payments-api",
      default_branch: "main",
      clone_path: null,
      last_polled_at: null,
      created_by: null,
    };
    expect(toShellRepo(repo).syncedLabel).toBe("not synced");
  });
});
