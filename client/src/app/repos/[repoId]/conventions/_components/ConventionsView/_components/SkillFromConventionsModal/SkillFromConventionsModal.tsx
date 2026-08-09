/* SkillFromConventionsModal — the last step of the extractor: merge the accepted
   candidates into one skill, editable before it is saved. Rejected and pending
   candidates cannot reach it; the server filters on the persisted verdict, and
   the preview here is built from the same accepted set. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { Convention, SkillType } from "@devdigest/shared";
import { useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { defaultSkillName } from "../../helpers";
import { BODY_ROWS, MAX_SKILL_BODY_CHARS, MODAL_WIDTH } from "./constants";
import { composeSkillBody } from "./helpers";
import { s } from "./styles";

const TYPE_OPTIONS: SkillType[] = ["convention", "rubric", "security", "custom"];

export interface SkillFromConventionsModalProps {
  repoId: string;
  repoFullName: string | undefined;
  accepted: Convention[];
  onClose: () => void;
  onCreated: (skillId: string) => void;
}

export function SkillFromConventionsModal({
  repoId,
  repoFullName,
  accepted,
  onClose,
  onCreated,
}: SkillFromConventionsModalProps) {
  const t = useTranslations("conventions");
  const create = useCreateSkillFromConventions(repoId);

  const fullName = repoFullName ?? "repo";
  const [name, setName] = React.useState(() => defaultSkillName(repoFullName));
  const [description, setDescription] = React.useState(() =>
    t("skillModal.defaultDescription", { count: accepted.length, repo: fullName }),
  );
  const [type, setType] = React.useState<SkillType>("convention");
  // Seeded once: the modal is remounted per open, and re-deriving the body would
  // throw away the user's edits the moment a background refetch landed.
  const [body, setBody] = React.useState(() => composeSkillBody(fullName, accepted));

  const over = body.length > MAX_SKILL_BODY_CHARS;
  const canSubmit = name.trim() !== "" && !over && !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    create.mutate(
      {
        name: name.trim(),
        description,
        type,
        body,
        convention_ids: accepted.map((c) => c.id),
      },
      { onSuccess: (skill) => onCreated(skill.id) },
    );
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("skillModal.title")}
      subtitle={name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("skillModal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!canSubmit}>
            {create.isPending ? t("skillModal.creating") : t("skillModal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.note}>
          {t("skillModal.mergedFrom", { count: accepted.length, repo: fullName })}
        </div>
        {create.isError && (
          <div role="alert" style={s.error}>
            {t("skillModal.createError")}
          </div>
        )}
        <FormField label={t("skillModal.name")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>
        <FormField label={t("skillModal.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={t("skillModal.type")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={TYPE_OPTIONS.map((o) => ({ value: o, label: o }))}
          />
        </FormField>
        <FormField label={t("skillModal.body")} required>
          <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
        </FormField>
        <div style={{ ...s.counter, ...(over ? s.over : {}) }}>
          {t("skillModal.counter", { count: body.length, limit: MAX_SKILL_BODY_CHARS })}
        </div>
      </div>
    </Modal>
  );
}
