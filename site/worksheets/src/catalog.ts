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
  minutes: number;
  pages: number;
  /** Empty when the sheet is not listed under any skill. */
  grade: string;
  strand: string;
  strandName: string;
  /** The skills it teaches, practises or checks; the ones it reviews if none. */
  skills: SkillData[];
  /** True when the sheet only reviews skills. */
  review: boolean;
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
      const first = skills[0];
      const sheet: Sheet = {
        id: w.id,
        title: w.title,
        minutes: w.minutes,
        pages: ref?.pages ?? 0,
        grade: first?.grade ?? '',
        strand: first?.strand ?? '',
        strandName: strandName.get(first?.strand ?? '') ?? '',
        skills,
        review: main.length === 0 && reviews.length > 0,
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

  /** The next sheet in the same grade and topic, in catalogue order. */
  next(sheet: Sheet): Sheet | undefined {
    const same = this.sheets.filter((s) => s.grade === sheet.grade && s.strand === sheet.strand);
    return same[same.indexOf(sheet) + 1];
  }

  /** Sheets for the skills this sheet's skills build on. */
  easier(sheet: Sheet, limit = 3): Sheet[] {
    return this.linked(sheet, 1, 0, limit);
  }

  /** Sheets for the skills this sheet's skills lead to. */
  harder(sheet: Sheet, limit = 3): Sheet[] {
    return this.linked(sheet, 0, 1, limit);
  }

  private linked(sheet: Sheet, from: 0 | 1, to: 0 | 1, limit: number): Sheet[] {
    const mine = new Set(sheet.skills.map((s) => s.id));
    const out: Sheet[] = [];
    for (const link of this.site.links) {
      if (!mine.has(link[from])) {
        continue;
      }
      const skill = this.skillsById.get(link[to]);
      for (const r of skill?.worksheets ?? []) {
        const s = this.byId.get(r.id);
        if (s && s !== sheet && r.role !== 'reviews' && !out.includes(s)) {
          out.push(s);
        }
      }
    }
    return out.slice(0, limit);
  }
}
