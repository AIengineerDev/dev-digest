/* AddSkillModal — one modal, three origins for the same object: write the body
   here, read it from a file on disk, or have the server fetch it from a URL.

   The two import tabs store `source: 'imported_url' | 'imported_file'`, which is
   what makes the assembler wrap those bodies as untrusted (specs/02-skills.md,
   *Security*). The client never sets `source`; it only chooses the endpoint. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, Tabs, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import {
  useCreateSkill,
  useImportSkillFromFile,
  useImportSkillFromUrl,
} from "../../../../../../lib/hooks/skills";
import { MAX_SKILL_BODY_CHARS } from "../../constants";
import { BODY_ROWS, DEFAULT_TYPE, MODAL_WIDTH, TABS, TYPE_OPTIONS } from "./constants";
import { FILE_ACCEPT, errorMessage, isAllowedFilename, type AddSkillTab } from "./helpers";
import { s } from "./styles";

export interface AddSkillModalProps {
  /** Tab to open on. The menu has one entry per origin, so it picks. */
  initialTab: AddSkillTab;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function AddSkillModal({ initialTab, onClose, onCreated }: AddSkillModalProps) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const importUrl = useImportSkillFromUrl();
  const importFile = useImportSkillFromFile();

  const [tab, setTab] = React.useState<AddSkillTab>(initialTab);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState("");
  const [url, setUrl] = React.useState("");
  // The file is held as its text, not as a `File`: the browser reads it once on
  // selection so the submit path has nothing async left to fail at.
  const [file, setFile] = React.useState<{ filename: string; text: string } | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const pending = create.isPending || importUrl.isPending || importFile.isPending;
  const over = body.length > MAX_SKILL_BODY_CHARS;
  const importOver = (file?.text.length ?? 0) > MAX_SKILL_BODY_CHARS;

  // Name is required only when creating: an import derives it from the first
  // heading, and demanding it up front would make the field a lie.
  const canSubmit =
    !pending &&
    (tab === "create"
      ? name.trim().length > 0 && !over
      : tab === "url"
        ? url.trim().length > 0
        : file !== null && !importOver);

  const mutation = tab === "create" ? create : tab === "url" ? importUrl : importFile;
  const error = mutation.isError ? mutation.error : null;

  const onSuccess = (skill: { id: string }) => {
    onClose();
    onCreated(skill.id);
  };

  const pickFile = (chosen: File | undefined) => {
    setFile(null);
    setFileError(null);
    if (!chosen) return;
    if (!isAllowedFilename(chosen.name)) {
      setFileError(t("add.file.wrongType", { accept: FILE_ACCEPT }));
      return;
    }
    chosen
      .text()
      .then((text) => setFile({ filename: chosen.name, text }))
      .catch(() => setFileError(t("add.file.readError")));
  };

  const submit = () => {
    if (!canSubmit) return;
    // Optional metadata is sent only when filled in, so a blank field means
    // "derive it", not "store an empty string".
    const meta = {
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      type,
    };
    if (tab === "create") {
      create.mutate({ name: name.trim(), description, type, body, enabled: true }, { onSuccess });
    } else if (tab === "url") {
      importUrl.mutate({ url: url.trim(), ...meta }, { onSuccess });
    } else if (file) {
      importFile.mutate({ filename: file.filename, body: file.text, ...meta }, { onSuccess });
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("add.title")}
      subtitle={t("add.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button
            kind="primary"
            icon={tab === "create" ? "Plus" : "Upload"}
            onClick={submit}
            disabled={!canSubmit}
          >
            {pending ? t(`add.${tab}.submitting`) : t(`add.${tab}.submit`)}
          </Button>
        </div>
      }
    >
      <Tabs
        tabs={TABS.map((x) => ({ key: x.key, icon: x.icon, label: t(`add.tabs.${x.key}`) }))}
        value={tab}
        onChange={(k) => setTab(k as AddSkillTab)}
        pad="0 22px"
      />

      <div style={s.body}>
        {error && (
          <div role="alert" style={s.error}>
            {errorMessage(error, t(`add.${tab}.error`))}
          </div>
        )}

        {tab === "url" && (
          <FormField label={t("add.url.field")} hint={t("add.url.hint")} required>
            <TextInput
              value={url}
              onChange={setUrl}
              placeholder={t("add.url.placeholder")}
              mono
            />
          </FormField>
        )}

        {tab === "file" && (
          <FormField label={t("add.file.field")} hint={t("add.file.hint")} required>
            <div style={s.filePicker}>
              <input
                ref={fileInput}
                type="file"
                accept={FILE_ACCEPT}
                style={s.fileInput}
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <Button kind="ghost" icon="Upload" onClick={() => fileInput.current?.click()}>
                {t("add.file.choose")}
              </Button>
              <span style={s.fileName} className="mono">
                {file ? file.filename : t("add.file.none")}
              </span>
            </div>
          </FormField>
        )}

        {fileError && (
          <div role="alert" style={s.error}>
            {fileError}
          </div>
        )}
        {importOver && (
          <div role="alert" style={s.error}>
            {t("editor.overLimit", { count: file?.text.length ?? 0, limit: MAX_SKILL_BODY_CHARS })}
          </div>
        )}

        <FormField
          label={t("create.fields.name")}
          hint={tab === "create" ? undefined : t("add.derivedName")}
          required={tab === "create"}
        >
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

        {tab === "create" && (
          <FormField
            label={t("create.fields.body")}
            right={
              <span className="mono tnum" style={s.count(over)}>
                {t("editor.count", { count: body.length, limit: MAX_SKILL_BODY_CHARS })}
              </span>
            }
            hint={
              over
                ? t("editor.overLimit", { count: body.length, limit: MAX_SKILL_BODY_CHARS })
                : undefined
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
        )}
      </div>
    </Modal>
  );
}
