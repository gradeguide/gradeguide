/** The data file written by //site/data:math. */
export interface SiteData {
  version: string;
  grades: string[];
  strands: StrandData[];
  topics: TopicData[];
  units: UnitData[];
  skills: SkillData[];
  links: [string, string][];
  credits: Credit[];
}

export interface StrandData {
  id: string;
  name: string;
  description: string;
}

export interface TopicData {
  id: string;
  strand: string;
  name: string;
}

export interface UnitData {
  id: string;
  grade: string;
  ordinal: string;
  name: string;
  /** 1 is September and 10 is June. */
  startMonth: number;
  endMonth: number;
}

export interface SkillData {
  id: string;
  code: string;
  grade: string;
  strand: string;
  topic?: string;
  name: string;
  explanation: string;
  example: string;
  tryAtHome: string;
  /** True until a teacher has reviewed the text. */
  draft: boolean;
  /** The standard's official wording. It may hold TeX such as \frac{a}{b}. */
  statement: string;
  unitId?: string;
  /** The month the main unit starts teaching it: 1 is September, 10 is June. */
  month: number;
  also?: { unitId: string; month: number }[];
  parts?: { code: string; name: string }[];
  /** The smaller steps inside the skill. Older data files list them as plain text. */
  steps?: (string | StepData)[];
  /** Printable worksheets that teach or practise the skill. */
  worksheets?: WorksheetRef[];
}

/** StepData is one smaller step inside a skill: a learning component. */
export interface StepData {
  id: string;
  /** A short name, such as "Generate equivalent fractions". */
  name: string;
  /** The full description. */
  text: string;
}

export type WorksheetRole = 'teaches' | 'practises' | 'checks' | 'reviews';

export interface WorksheetRef {
  id: string;
  title: string;
  /** Not shown: how long a sheet takes depends on the child. */
  minutes?: number;
  pages: number;
  /** The worksheet to print. */
  href: string;
  /** The worksheet beside a copy filled in with the answers. */
  answersHref: string;
  /** How the worksheet relates to the skill it is listed under. */
  role?: WorksheetRole;
  /** The skill's smaller steps the worksheet covers, and where on the sheet. */
  steps?: { stepId: string; where: string }[];
  /** The worksheet as a PDF, without answers. */
  pdf?: string;
  answersPdf?: string;
  /** An image of the first page. */
  thumbnail?: string;
}

export interface Credit {
  author: string;
  statement: string;
  license: string;
}

export const MONTHS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

/** Curriculum indexes the site data for the views. */
export class Curriculum {
  readonly skills: readonly SkillData[];
  readonly grades: readonly string[];
  readonly strands: readonly StrandData[];
  readonly credits: readonly Credit[];
  private readonly byId = new Map<string, SkillData>();
  private readonly unitsById = new Map<string, UnitData>();
  private readonly topicsById = new Map<string, TopicData>();
  private readonly strandsById = new Map<string, StrandData>();
  private readonly before = new Map<string, string[]>();
  private readonly after = new Map<string, string[]>();

  constructor(readonly data: SiteData) {
    this.skills = data.skills;
    this.grades = data.grades;
    this.strands = data.strands;
    this.credits = data.credits;
    for (const s of data.skills) this.byId.set(s.id, s);
    for (const u of data.units) this.unitsById.set(u.id, u);
    for (const t of data.topics) this.topicsById.set(t.id, t);
    for (const s of data.strands) this.strandsById.set(s.id, s);
    for (const [from, to] of data.links) {
      if (!this.byId.has(from) || !this.byId.has(to)) continue;
      push(this.after, from, to);
      push(this.before, to, from);
    }
  }

  skill(id: string): SkillData | undefined {
    return this.byId.get(id);
  }

  unit(id: string | undefined): UnitData | undefined {
    return id ? this.unitsById.get(id) : undefined;
  }

  topic(id: string | undefined): TopicData | undefined {
    return id ? this.topicsById.get(id) : undefined;
  }

  strand(id: string): StrandData | undefined {
    return this.strandsById.get(id);
  }

  /** The smaller steps inside a skill, with ids even where the data gives only text. */
  steps(id: string): StepData[] {
    return (this.byId.get(id)?.steps ?? []).map((st, i) =>
      typeof st === 'string' ? { id: `${id}#${i + 1}`, name: plainStatement(st), text: plainStatement(st) } : st,
    );
  }

  /** A skill's worksheets: ones that teach, practise or check it first, then ones that review it. */
  worksheets(id: string): WorksheetRef[] {
    const ws = [...(this.byId.get(id)?.worksheets ?? [])];
    return ws.sort((a, b) => Number(a.role === 'reviews') - Number(b.role === 'reviews'));
  }

  /** Skills that build towards id: what a child needs first. */
  neededFirst(id: string): SkillData[] {
    return this.lookup(this.before.get(id));
  }

  /** Skills id builds towards: what it leads to. */
  leadsTo(id: string): SkillData[] {
    return this.lookup(this.after.get(id));
  }

  /** The skills of one grade, in code order. */
  inGrade(grade: string): SkillData[] {
    return this.skills.filter((s) => s.grade === grade);
  }

  /**
   * Every skill id leads back to through needed-first links, including id
   * itself. depth limits how many steps back to walk.
   */
  foundations(id: string, depth = 6): Set<string> {
    const seen = new Set([id]);
    let frontier = [id];
    for (let d = 0; d < depth && frontier.length; d++) {
      const next: string[] = [];
      for (const s of frontier) {
        for (const p of this.before.get(s) ?? []) {
          if (!seen.has(p)) {
            seen.add(p);
            next.push(p);
          }
        }
      }
      frontier = next;
    }
    return seen;
  }

  /** Lower-case text matched by search: the name, code and parent-facing text. */
  searchText(s: SkillData): string {
    return [s.name, s.code, s.explanation, s.example, s.tryAtHome, this.topic(s.topic)?.name ?? '']
      .join(' ')
      .toLowerCase();
  }

  private lookup(ids: string[] | undefined): SkillData[] {
    return (ids ?? [])
      .map((i) => this.byId.get(i))
      .filter((s): s is SkillData => !!s)
      .sort(compareSkills(this.grades));
  }
}

/** Orders skills by grade, then month, then code. */
export function compareSkills(grades: readonly string[]) {
  return (a: SkillData, b: SkillData) =>
    grades.indexOf(a.grade) - grades.indexOf(b.grade) || a.month - b.month || a.code.localeCompare(b.code, 'en', { numeric: true });
}

/** Turns the TeX in official wording into plain text: \frac{a}{b} becomes a/b. */
export function plainStatement(text: string): string {
  return text
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\(le|leq)\b/g, '≤')
    .replace(/\\(ge|geq)\b/g, '≥')
    .replace(/\\cdot/g, '·')
    .replace(/\\pi/g, 'π')
    .replace(/\^\{?2\}?/g, '²')
    .replace(/\^\{?3\}?/g, '³')
    .replace(/\\[a-z]+/g, '')
    .replace(/[{}$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function push(m: Map<string, string[]>, k: string, v: string) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}
