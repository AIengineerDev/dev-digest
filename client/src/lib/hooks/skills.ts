/* hooks/skills.ts — React Query hooks for the Skills Lab + Agent Editor → Skills tab.

   Mirrors hooks/agents.ts: one query per read endpoint, mutations invalidate the
   list and write through to the single-item cache. Write shapes come from
   @devdigest/shared (CreateSkillInput / UpdateSkillInput) — never redeclared here. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CreateSkillInput,
  Skill,
  SkillType,
  SkillVersion,
  UpdateSkillInput,
} from "@devdigest/shared";

/** Server-side filters for GET /skills (`?type=`, `?enabled=`, `?q=`). */
export interface SkillListFilters {
  type?: SkillType;
  enabled?: boolean;
  q?: string;
}

function skillsPath(filters: SkillListFilters | undefined): string {
  const params = new URLSearchParams();
  if (filters?.type) params.set("type", filters.type);
  if (filters?.enabled !== undefined) params.set("enabled", String(filters.enabled));
  if (filters?.q) params.set("q", filters.q);
  const qs = params.toString();
  return qs ? `/skills?${qs}` : "/skills";
}

export function useSkills(filters?: SkillListFilters) {
  // Filters are part of the key so each filtered list caches separately; every
  // mutation below invalidates the ["skills"] prefix, which covers all of them.
  return useQuery({
    queryKey: ["skills", filters ?? null],
    queryFn: () => api.get<Skill[]>(skillsPath(filters)),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

/** Version history for a skill, newest first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** One immutable snapshot of a skill body. */
export function useSkillVersion(
  id: string | null | undefined,
  version: number | null | undefined,
) {
  return useQuery({
    queryKey: ["skill-version", id, version],
    queryFn: () => api.get<SkillVersion>(`/skills/${id}/versions/${version}`),
    enabled: !!id && version != null,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillVariables {
  id: string;
  patch: UpdateSkillInput;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillVariables) =>
      api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      // A body edit bumps `version` and appends a snapshot, so the history a
      // version pane is showing is stale the moment the save lands.
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
      qc.removeQueries({ queryKey: ["skill-versions", id] });
    },
  });
}
