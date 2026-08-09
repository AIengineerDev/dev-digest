import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { SkillList } from "./SkillList";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "hermetic-boundaries",
  description: "Only *.it.test.ts may touch Postgres",
  type: "convention",
  source: "manual",
  body: "# Hermetic boundaries\n",
  enabled: true,
  version: 3,
};

const DISABLED: Skill = {
  ...SKILL,
  id: "sk2",
  name: "seam-not-internals",
  description: "",
  type: "rubric",
  enabled: false,
};

function renderList(props: Partial<React.ComponentProps<typeof SkillList>> = {}) {
  const merged: React.ComponentProps<typeof SkillList> = {
    skills: [SKILL, DISABLED],
    activeId: "sk1",
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    search: "",
    onSearch: vi.fn(),
    onSelect: vi.fn(),
    onToggle: vi.fn(),
    onCreate: vi.fn(),
    ...props,
  };
  return {
    props: merged,
    ...render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillList {...merged} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("SkillList", () => {
  it("renders each skill with its type badge, source badge and enabled toggle", () => {
    renderList();
    expect(screen.getByText("hermetic-boundaries")).toBeInTheDocument();
    expect(screen.getByText("convention")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getAllByText("Manual")).toHaveLength(2);

    const toggles = screen.getAllByRole("switch");
    expect(toggles[0]).toHaveAttribute("aria-checked", "true");
    expect(toggles[1]).toHaveAttribute("aria-checked", "false");
  });

  it("falls back to a translated placeholder for an empty description", () => {
    renderList();
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("toggling a row reports the flipped value for that skill", () => {
    const { props } = renderList();
    fireEvent.click(screen.getAllByRole("switch")[1]!);
    expect(props.onToggle).toHaveBeenCalledWith("sk2", true);
  });

  it("renders an error with retry — never an empty list — when the load failed", () => {
    const { props } = renderList({ skills: [], isError: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load skills.");
    expect(screen.queryByText("No skills yet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("shows the empty state, not the no-match state, when nothing is searched", () => {
    renderList({ skills: [] });
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    expect(screen.queryByText("No matching skills")).not.toBeInTheDocument();
  });

  it("keeps the three import entries in the Add Skill menu, disabled with a hint", () => {
    const { props } = renderList();
    fireEvent.click(screen.getByText("Add Skill"));

    expect(screen.getByText("Import from file")).toBeInTheDocument();
    expect(screen.getByText("Import from URL")).toBeInTheDocument();
    expect(screen.getByText("Search community skills…")).toBeInTheDocument();
    expect(screen.getAllByText("coming soon")).toHaveLength(3);

    // Only "Create from scratch" does anything in v1.
    fireEvent.click(screen.getByText("Import from file"));
    expect(props.onCreate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Add Skill"));
    fireEvent.click(screen.getByText("Create from scratch"));
    expect(props.onCreate).toHaveBeenCalledTimes(1);
  });
});
