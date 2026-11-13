// The worksheet catalogue as the pages see it: each sheet with the grade,
// topic and skills it belongs to, taken from the site data, so the pages can
// list, search and link sheets without composing them.
import { type Library, type Worksheet } from '../../../worksheet/proto/v1/worksheet_pb.js';

/** The parts of math.json these pages read. */
export interface SiteData {
  grades: string[];
  strands: { id: string; name: string }[];
  skills: SkillData[];
  /** Prerequisite links, [needed first, leads to], by skill id. */
  links: [string, string][];
}

export interface SkillData {
  id: string;
  code: string;
  grade: string;
  strand: string;
  name: string;
  /** The month the skill is usually taught: 1 is September, 10 is June. */
  month?: number;
  /** The skill's static page, such as "/math/grade-4/4-nf-a-1-equivalent-fractions/". */
  path?: string;
  worksheets?: {
    id: string;
    role: string;
    pages: number;
    pdf?: string;
    answersPdf?: string;
    thumbnail?: string;
  }[];
}

export interface Sheet {
  id: string;
  title: string;
  pages: number;
  /** Empty when the sheet is not listed under any skill. */
  grade: string;
  strand: string;
  strandName: string;
  /** The skills it teaches, practises or checks; the ones it reviews if none. */
  skills: SkillData[];
  /** True when the sheet only reviews skills. */
  review: boolean;
  /** The skill the library files the sheet under: its earliest-taught skill. */
  primary?: SkillData;
  homeTip: string;
  pdf?: string;
  answersPdf?: string;
  thumbnail?: string;
  record: Worksheet;
}

export class Catalog {
  readonly sheets: Sheet[];
  private readonly byId = new Map<string, Sheet>();
  private readonly skillsById = new Map<string, SkillData>();

  constructor(
    readonly site: SiteData,
    readonly library: Library,
  ) {
    for (const s of site.skills) {
      this.skillsById.set(s.id, s);
    }
    const strandName = new Map(site.strands.map((s) => [s.id, s.name]));
    this.sheets = library.worksheets.map((w) => {
      const main: SkillData[] = [];
      const reviews: SkillData[] = [];
      let ref: NonNullable<SkillData['worksheets']>[number] | undefined;
      for (const s of site.skills) {
        const r = s.worksheets?.find((x) => x.id === w.id);
        if (r) {
          (r.role === 'reviews' ? reviews : main).push(s);
          ref ??= r;
        }
      }
      const skills = main.length ? main : reviews;
      const first = [...skills].sort((a, b) => (a.month ?? 99) - (b.month ?? 99))[0];
      const sheet: Sheet = {
        id: w.id,
        title: w.title,
        pages: ref?.pages ?? 0,
        grade: first?.grade ?? '',
        strand: first?.strand ?? '',
        strandName: strandName.get(first?.strand ?? '') ?? '',
        skills,
        review: main.length === 0 && reviews.length > 0,
        primary: first,
        homeTip: w.homeTip,
        pdf: ref?.pdf,
        answersPdf: ref?.answersPdf,
        thumbnail: ref?.thumbnail,
        record: w,
      };
      this.byId.set(w.id, sheet);
      return sheet;
    });
  }

  sheet(id: string): Sheet | undefined {
    return this.byId.get(id);
  }

  /** The sheets for a grade and topic matching a search, in catalogue order. */
  find(grade: string, strand: string, query: string): Sheet[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.sheets.filter((s) => {
      if (words.length) {
        const text = [s.title, s.strandName, ...s.skills.flatMap((k) => [k.name, k.code])].join(' ').toLowerCase();
        return words.every((w) => text.includes(w));
      }
      return s.grade === grade && (!strand || s.strand === strand);
    });
  }

  /**
   * The library for a grade and topic: by month, then by skill in the map's
   * order, each sheet under its primary skill.
   */
  byMonth(grade: string, strand: string): Month[] {
    const months: Month[] = [];
    const skillOrder = new Map(this.site.skills.map((s, i) => [s.id, i]));
    const sheets = this.find(grade, strand, '').filter((s) => s.primary);
    sheets.sort(
      (a, b) =>
        (a.primary!.month ?? 99) - (b.primary!.month ?? 99) ||
        skillOrder.get(a.primary!.id)! - skillOrder.get(b.primary!.id)! ||
        this.sheets.indexOf(a) - this.sheets.indexOf(b),
    );
    for (const s of sheets) {
      const m = s.primary!.month ?? 0;
      let month = months[months.length - 1];
      if (!month || month.month !== m) {
        month = { month: m, skills: [] };
        months.push(month);
      }
      let skill = month.skills[month.skills.length - 1];
      if (!skill || skill.skill !== s.primary) {
        skill = { skill: s.primary!, sheets: [] };
        month.skills.push(skill);
      }
      skill.sheets.push(s);
    }
    return months;
  }

  /**
   * Sheets related to this one, in four groups: the same skills, the skills
   * they build on, the skills they lead to, and other skills of the same
   * grade taught within a month of them. No sheet appears twice, and empty
   * groups are left out.
   */
  related(sheet: Sheet, limit = 4): Related[] {
    const mine = new Set(sheet.skills.map((s) => s.id));
    const seen = new Set<Sheet>([sheet]);
    const sheetsOf = (skills: Iterable<SkillData | undefined>): Sheet[] => {
      const out: Sheet[] = [];
      for (const k of skills) {
        for (const r of k?.worksheets ?? []) {
          const s = this.byId.get(r.id);
          if (s && r.role !== 'reviews' && !seen.has(s) && !out.includes(s)) {
            out.push(s);
          }
        }
      }
      const kept = out.slice(0, limit);
      kept.forEach((s) => seen.add(s));
      return kept;
    };
    const linked = (from: 0 | 1, to: 0 | 1) => this.site.links.filter((l) => mine.has(l[from])).map((l) => this.skillsById.get(l[to]));
    const months = sheet.skills.map((s) => s.month).filter((m): m is number => m !== undefined);
    const nearby = this.site.skills.filter(
      (s) => s.grade === sheet.grade && !mine.has(s.id) && s.month !== undefined && months.some((m) => Math.abs(m - s.month!) <= 1),
    );
    const groups: Related[] = [
      { kind: 'same', sheets: sheetsOf(sheet.skills) },
      { kind: 'before', sheets: sheetsOf(linked(1, 0)) },
      { kind: 'after', sheets: sheetsOf(linked(0, 1)) },
      { kind: 'nearby', sheets: sheetsOf(nearby) },
    ];
    return groups.filter((g) => g.sheets.length > 0);
  }
}

/** A month of the library: 1 is September, 0 when the month is unknown. */
export interface Month {
  month: number;
  skills: { skill: SkillData; sheets: Sheet[] }[];
}

/** One group of related sheets. */
export interface Related {
  kind: 'same' | 'before' | 'after' | 'nearby';
  sheets: Sheet[];
}

const MONTHS = ['September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June'];

/** The name of a school month: 1 is September. */
export function monthName(m: number): string {
  return MONTHS[m - 1] ?? 'Any time';
}
