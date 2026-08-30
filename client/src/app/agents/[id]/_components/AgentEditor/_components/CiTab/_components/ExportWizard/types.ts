import type { useTranslations } from "next-intl";

/** The `t` function `useTranslations("ci.exportWizard")` returns — shared so
 *  every step component's prop type matches the caller's exactly, without
 *  re-deriving next-intl's (large, generic) return type in each file. */
export type TFunc = ReturnType<typeof useTranslations>;
