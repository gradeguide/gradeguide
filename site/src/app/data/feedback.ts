/** Where feedback goes: a new issue on the project's GitHub repository. */
export const ISSUES_URL = 'https://github.com/gradeguide/gradeguide/issues/new';

/** The issue forms in .github/ISSUE_TEMPLATE. */
const FORMS = {
  general: '1-general.yml',
  skill: '2-skill.yml',
  worksheet: '3-worksheet.yml',
  problem: '4-site-problem.yml',
} as const;

export type FeedbackKind = keyof typeof FORMS;

/**
 * Returns the address of a new issue using one of the feedback forms, with
 * its fields filled in. GitHub fills a form field whose id matches a query
 * parameter, and the title from "title".
 */
export function feedbackUrl(kind: FeedbackKind, fields: Record<string, string> = {}): string {
  const q = new URLSearchParams({ template: FORMS[kind] });
  for (const [k, v] of Object.entries(fields)) if (v) q.set(k, v);
  return `${ISSUES_URL}?${q}`;
}
