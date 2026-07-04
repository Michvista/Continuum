import { Fragment } from "@prisma/client";

// Looks for "<word> <number><unit>" patterns (e.g. "omeprazole 20mg",
// "amoxicillin 500 mg") and flags a conflict if the same word appears in an
// earlier fragment for the same patient with a DIFFERENT number attached.
// This is a deliberately simple heuristic for demo purposes — see Continuum's
// pitch notes: real conflict detection is Cognee's job over time, this is
// just a fast first pass so the UI has something to flag immediately.
const DOSAGE_PATTERN = /([a-zA-Z][a-zA-Z-]{3,})\s+(\d+(?:\.\d+)?)\s?(mg|mcg|ml|g|iu)\b/gi;

export function detectPotentialConflict(
  newContent: string,
  existingFragments: Fragment[]
): string | null {
  const newMatches = [...newContent.matchAll(DOSAGE_PATTERN)].map((m) => ({
    drug: m[1].toLowerCase(),
    value: m[2],
    unit: m[3].toLowerCase(),
  }));
  if (newMatches.length === 0) return null;

  for (const fragment of existingFragments) {
    const oldMatches = [...fragment.content.matchAll(DOSAGE_PATTERN)].map((m) => ({
      drug: m[1].toLowerCase(),
      value: m[2],
      unit: m[3].toLowerCase(),
    }));
    for (const nm of newMatches) {
      for (const om of oldMatches) {
        if (nm.drug === om.drug && nm.unit === om.unit && nm.value !== om.value) {
          return fragment.id;
        }
      }
    }
  }
  return null;
}
