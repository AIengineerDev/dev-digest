import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

const SKILL: Skill = {
  id: "sk1",
  name: "assertions-that-can-fail",
  description: "A test that passes with the change reverted proves nothing",
  type: "convention",
  source: "manual",
  body: "# Assertions that can fail\n",
  enabled: true,
  version: 2,
};

const state = {
  skill: SKILL as Skill | undefined,
  isLoading: false,
  isError: false,
  mutate: vi.fn(),
};

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useSkill: () => ({
    data: state.skill,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch: vi.fn(),
  }),
  useUpdateSkill: () => ({ mutate: state.mutate, isPending: false, isError: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { MAX_SKILL_BODY_CHARS } from "../../constants";
import { SkillEditor } from "./SkillEditor";

afterEach(cleanup);
beforeEach(() => {
  state.skill = SKILL;
  state.isLoading = false;
  state.isError = false;
  state.mutate = vi.fn();
});

function renderEditor() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillEditor id="sk1" />
    </NextIntlClientProvider>,
  );
}

function body() {
  return screen.getByLabelText(SKILL.name);
}

describe("SkillEditor", () => {
  it("shows the saved body with no unsaved badge, and a count against the limit", () => {
    renderEditor();
    expect(body()).toHaveValue(SKILL.body);
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(
      screen.getByText(`${SKILL.body.length} / ${MAX_SKILL_BODY_CHARS}`),
    ).toBeInTheDocument();
  });

  it("marks the editor unsaved once the body differs, and saves the edited body", () => {
    renderEditor();
    fireEvent.change(body(), { target: { value: "# Edited\n" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Save"));
    expect(state.mutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { body: "# Edited\n" } },
      expect.anything(),
    );
  });

  it("blocks a save over the per-skill limit and names the limit", () => {
    renderEditor();
    const tooLong = "x".repeat(MAX_SKILL_BODY_CHARS + 1);
    fireEvent.change(body(), { target: { value: tooLong } });

    expect(screen.getByRole("alert")).toHaveTextContent(
      `The limit is ${MAX_SKILL_BODY_CHARS} per skill`,
    );
    fireEvent.click(screen.getByText("Save"));
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("renders an error with retry when the skill fails to load", () => {
    state.skill = undefined;
    state.isError = true;
    renderEditor();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load this skill.");
  });
});
