/**
 * Poster intent detection and title extraction.
 *
 * Regression: the previous implementation matched five exact substrings, so
 * "Can I see Green Mile poster" — the phrasing a real customer actually used — was not
 * recognised as a poster request at all, and no poster was ever sent.
 */
// sonia.ts pulls in the Mongo client at import time; these are pure string functions.
jest.mock("@/lib/mongodb", () => ({ __esModule: true, default: Promise.resolve({ db: () => ({ collection: () => ({}) }) }) }));

import { isPosterRequest, extractPosterTitle } from "@/lib/ai/sonia";

describe("isPosterRequest", () => {
  const wants = [
    "Can I see Green Mile poster",
    "can i see the poster",
    "show me the poster",
    "show me the image",
    "show me a picture",
    "can i see it",
    "poster?",
    "send me the poster",
    "can you show me the poster for Dune",
    "Green Mile poster",
    "share the artwork",
    "let me see it",
  ];
  test.each(wants)("recognises %p", (text) => {
    expect(isPosterRequest(text)).toBe(true);
  });

  const doesNot = [
    "what is the green mile about",
    "recommend me a thriller",
    "I loved that movie, the cinematography was beautiful",
    "who directed it",
    "",
  ];
  test.each(doesNot)("does not fire on %p", (text) => {
    expect(isPosterRequest(text)).toBe(false);
  });
});

describe("extractPosterTitle", () => {
  test.each([
    ["Can I see Green Mile poster", "Green Mile"],
    ["show me the poster for Dune", "Dune"],
    ["can you show me the Interstellar poster", "Interstellar"],
    ["The Green Mile poster", "Green Mile"],
    ["poster of Blade Runner 2049", "Blade Runner 2049"],
  ])("%p -> %p", (input, expected) => {
    expect(extractPosterTitle(input)).toBe(expected);
  });

  test.each(["show me the poster", "can i see it", "poster?", "show me the image"])(
    "%p names no title, so the active context is used",
    (input) => {
      expect(extractPosterTitle(input)).toBeNull();
    }
  );
});
