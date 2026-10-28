// A section named by its number: `section 5`, `Section 10`, `sections 5 and 6`,
// `section #7`, `sec. 7`, `§7`. The configuration view numbers what it shows and
// `.env.example` keeps its own numbers, so prose names a section by its title.
// A8-38 checks the pattern on both sides; A8-37 and A8-38 search with it.
export const SECTION_BY_NUMBER = /\b(?:sections?|sec\.)\s*#?\s*\d|§\s*\d/i;
