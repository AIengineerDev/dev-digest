/* CreateSkillModal — the one active entry of the "Add Skill" menu in v1:
   create from scratch. Import from file / URL / community need the untrusted-
   source story from specs/02-skills.md and are disabled in the menu. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { MAX_SKILL_BODY_CHARS } from "../../constants";
import { BODY_ROWS, DEFAULT_TYPE, MODAL_WIDTH, TYPE_OPTIONS } from "./constants";
import { s } from "./styles";

export interface CreateSkillModalProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function CreateSkillModal({ onClose, onCreated }: CreateSkillModalProps) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState("");

  const over = body.length > MAX_SKILL_BODY_CHARS;
  const canSubmit = name.trim().length > 0 && !over && !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    create.mutate(
      { name: name.trim(), description, type, body, enabled: true },
      {
        onSuccess: (skill) => {
          onClose();
          onCreated(skill.id);
        },
      },
    );
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={!canSubmit}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {create.isError && (
          <div role="alert" style={s.error}>
            {t("create.createError")}
          </div>
        )}
        <FormField label={t("create.fields.name")} required>
          <TextInput
            value={name}
            onChange={setName}
            placeholder={t("create.fields.namePlaceholder")}
            mono
          />
        </FormField>
        <FormField label={t("create.fields.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("create.fields.type")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={TYPE_OPTIONS.map((o) => ({ value: o, label: t(`listItem.type.${o}`) }))}
          />
        </FormField>
        <FormField
          label={t("create.fields.body")}
          right={
            <span className="mono tnum" style={s.count(over)}>
              {t("editor.count", { count: body.length, limit: MAX_SKILL_BODY_CHARS })}
            </span>
          }
          hint={
            over ? t("editor.overLimit", { count: body.length, limit: MAX_SKILL_BODY_CHARS }) : undefined
          }
        >
          <Textarea
            value={body}
            onChange={setBody}
            rows={BODY_ROWS}
            mono
            placeholder={t("create.fields.bodyPlaceholder")}
          />
        </FormField>
      </div>
    </Modal>
  );
}
