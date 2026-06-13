import type { AICompanionProfile, CompanionRace } from "./types";

export const COMPANION_RACE_OPTIONS: { value: CompanionRace; label: string }[] = [
  { value: "black_african", label: "Black / African" },
  { value: "white_caucasian", label: "White / Caucasian" },
  { value: "asian", label: "Asian" },
  { value: "native_indigenous", label: "Native American / Indigenous Peoples" },
  { value: "pacific_islander", label: "Pacific Islander" },
  { value: "mena", label: "Middle Eastern / North African (MENA)" },
];

export function getCompanionAvatarUrl(companion: AICompanionProfile) {
  return companion.avatarUrl ?? "";
}
