import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ApiError } from "../../../../../../../lib/api";

/* The tab is driven entirely by two queries + one mutation; mocking the hook
   module lets each state (loading / error / loaded) be asserted directly. */
interface QueryStub<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

const setSkillsMutate = vi.fn();
const skillsQuery: QueryStub<Skill[]> = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};
const linksQuery: QueryStub<AgentSkillLink[]> = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};
const setSkillsMutation = { mutate: setSkillsMutate, isPending: false, isError: false };

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => skillsQuery,
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkills: () => linksQuery,
  useSetAgentSkills: () => setSkillsMutation,
}));

import { SkillsTab } from "./SkillsTab";
import { buildOrder, moveBefore, toSkillIds, canToggle, filterSkills } from "./helpers";

const AGENT = { id: "ag1", name: "Reviewer" } as Agent;

function skill(id: string, name: string, over: Partial<Skill> = {}): Skill {
  return {
    id,
    name,
    description: "",
    type: "rubric",
    source: "manual",
    body: "b",
    enabled: true,
    version: 1,
    ...over,
  };
}

const SKILLS: Skill[] = [
  skill("s1", "test-typology"),
  skill("s2", "assertions-that-can-fail", { type: "convention" }),
  skill("s3", "retired-rule", { enabled: false, type: "security" }),
];

const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "s2", order: 0 },
  { agent_id: "ag1", skill_id: "s1", order: 1 },
];

function setQueries(opts: {
  skills?: Partial<QueryStub<Skill[]>>;
  links?: Partial<QueryStub<AgentSkillLink[]>>;
}) {
  Object.assign(skillsQuery, opts.skills);
  Object.assign(linksQuery, opts.links);
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

/** The check button of a row, found by the skill's name. */
function checkbox(name: string) {
  return within(screen.getByRole("listitem", { name })).getByRole("checkbox");
}

/** The argument of the nth persist call (undefined if it never happened). */
function persisted(i = 0): unknown {
  return setSkillsMutate.mock.calls[i]?.[0];
}

/** Skill names in the order they are rendered. */
function renderedOrder(): string[] {
  return screen.getAllByRole("listitem").map((el) => el.getAttribute("aria-label") ?? "");
}

beforeEach(() => {
  setSkillsMutate.mockReset();
  setSkillsMutation.isPending = false;
  setSkillsMutation.isError = false;
  setQueries({
    skills: { data: SKILLS, isLoading: false, isError: false, error: null },
    links: { data: LINKS, isLoading: false, isError: false, error: null },
  });
});
afterEach(cleanup);

describe("SkillsTab — loading and error", () => {
  it("shows a busy placeholder, not an empty list, while loading", () => {
    setQueries({ skills: { data: undefined, isLoading: true } });
    renderTab();
    expect(screen.getByLabelText("Loading skills…")).toBeInTheDocument();
    expect(screen.queryByText("No skills yet")).not.toBeInTheDocument();
  });

  it("a failed load renders an error with the API message — never 'no skills'", () => {
    setQueries({
      skills: { data: undefined, isError: true, error: new ApiError("boom", 500) },
    });
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load skills");
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.queryByText("No skills yet")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("shows the empty state only when the list really is empty", () => {
    setQueries({ skills: { data: [] }, links: { data: [] } });
    renderTab();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });
});

describe("SkillsTab — list", () => {
  it("counts linked against the whole workspace, and links come first", () => {
    renderTab();
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    // s2 is linked at order 0, s1 at order 1, s3 is unlinked → tail.
    expect(renderedOrder()).toEqual(["assertions-that-can-fail", "test-typology", "retired-rule"]);
    expect(checkbox("assertions-that-can-fail")).toHaveAttribute("aria-checked", "true");
    expect(checkbox("retired-rule")).toHaveAttribute("aria-checked", "false");
  });

  it("filters by name and does not persist anything", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "retired" } });
    expect(renderedOrder()).toEqual(["retired-rule"]);
    expect(setSkillsMutate).not.toHaveBeenCalled();
  });
});

describe("SkillsTab — attach / detach", () => {
  it("detaching persists the remaining ids, still in order", () => {
    renderTab();
    fireEvent.click(checkbox("test-typology")); // linked → detach
    expect(setSkillsMutate).toHaveBeenCalledTimes(1);
    expect(persisted()).toEqual({ agentId: "ag1", skillIds: ["s2"] });
    expect(checkbox("test-typology")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();
  });

  it("attaching keeps the row's display position in the persisted order", () => {
    setQueries({ links: { data: [{ agent_id: "ag1", skill_id: "s1", order: 0 }] } });
    renderTab();
    // Display order is s1 (linked), then s2, s3 — so attaching s2 appends s2.
    fireEvent.click(checkbox("assertions-that-can-fail"));
    expect(persisted()).toEqual({ agentId: "ag1", skillIds: ["s1", "s2"] });
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
  });

  it("a globally disabled skill is shown, marked, and cannot be enabled here", () => {
    renderTab();
    const row = screen.getByRole("listitem", { name: "retired-rule" });
    expect(within(row).getByText("disabled")).toBeInTheDocument();
    const box = within(row).getByRole("checkbox");
    expect(box).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(box);
    expect(setSkillsMutate).not.toHaveBeenCalled();
    expect(box).toHaveAttribute("aria-checked", "false");
  });
});

describe("SkillsTab — reorder", () => {
  it("keyboard reorder moves the row and persists the new prompt order", () => {
    renderTab();
    const handle = within(screen.getByRole("listitem", { name: "test-typology" })).getByRole(
      "button",
      { name: "Reorder test-typology" },
    );
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(persisted()).toEqual({ agentId: "ag1", skillIds: ["s1", "s2"] });
    expect(renderedOrder()).toEqual([
      "test-typology",
      "assertions-that-can-fail",
      "retired-rule",
    ]);
  });

  it("drag and drop reorders through the dataTransfer id", () => {
    renderTab();
    const data: Record<string, string> = {};
    const dataTransfer = {
      setData: (k: string, v: string) => {
        data[k] = v;
      },
      getData: (k: string) => data[k] ?? "",
      effectAllowed: "",
    };
    // Drag "retired-rule" (last) onto the first row.
    fireEvent.dragStart(screen.getByRole("listitem", { name: "retired-rule" }), { dataTransfer });
    fireEvent.drop(screen.getByRole("listitem", { name: "assertions-that-can-fail" }), {
      dataTransfer,
    });
    expect(persisted()).toEqual({ agentId: "ag1", skillIds: ["s2", "s1"] });
    expect(renderedOrder()).toEqual([
      "retired-rule",
      "assertions-that-can-fail",
      "test-typology",
    ]);
  });

  it("dragging is disabled while a filter is active", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "test" } });
    expect(screen.getByRole("listitem", { name: "test-typology" })).toHaveAttribute(
      "draggable",
      "false",
    );
    expect(screen.getByText(/Clear the filter to reorder/)).toBeInTheDocument();
  });
});

describe("SkillsTab helpers", () => {
  it("buildOrder puts links first in order, then the rest, dropping unknown ids", () => {
    const withGhost = [...LINKS, { agent_id: "ag1", skill_id: "gone", order: 2 }];
    expect(buildOrder(SKILLS, withGhost)).toEqual(["s2", "s1", "s3"]);
  });

  it("moveBefore returns the same array for a no-op drop", () => {
    const order = ["a", "b", "c"];
    expect(moveBefore(order, "a", "a")).toBe(order);
    expect(moveBefore(order, "a", "zz")).toBe(order);
    expect(moveBefore(order, "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("toSkillIds keeps display order and drops unlinked ids", () => {
    expect(toSkillIds(["s2", "s1", "s3"], new Set(["s1", "s3"]))).toEqual(["s1", "s3"]);
  });

  it("canToggle blocks turning a globally disabled skill on, but allows off", () => {
    const off = skill("x", "x", { enabled: false });
    expect(canToggle(off, true)).toBe(false);
    expect(canToggle(off, false)).toBe(true);
    expect(canToggle(skill("y", "y"), true)).toBe(true);
  });

  it("filterSkills matches type as well as name", () => {
    expect(filterSkills(SKILLS, "security").map((s) => s.id)).toEqual(["s3"]);
  });
});
