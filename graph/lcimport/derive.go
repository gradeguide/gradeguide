package lcimport

import (
	"sort"
	"strings"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

// derive fills the fields Import computes rather than copies: each
// standard's strand and domain, each lesson's sequence, the pace of units,
// sections and lessons, and the placements.
func derive(g *graphpb.Graph) {
	deriveStrands(g)
	lessons := derivePace(g)
	g.Placements = placements(g, lessons)
}

var strands = map[string]graphpb.Strand{
	"CC":  graphpb.Strand_STRAND_COUNTING,
	"OA":  graphpb.Strand_STRAND_OPERATIONS_AND_ALGEBRA,
	"EE":  graphpb.Strand_STRAND_OPERATIONS_AND_ALGEBRA,
	"F":   graphpb.Strand_STRAND_OPERATIONS_AND_ALGEBRA,
	"NBT": graphpb.Strand_STRAND_NUMBER,
	"NS":  graphpb.Strand_STRAND_NUMBER,
	"NF":  graphpb.Strand_STRAND_FRACTIONS_AND_RATIOS,
	"RP":  graphpb.Strand_STRAND_FRACTIONS_AND_RATIOS,
	"MD":  graphpb.Strand_STRAND_MEASUREMENT_AND_DATA,
	"SP":  graphpb.Strand_STRAND_MEASUREMENT_AND_DATA,
	"G":   graphpb.Strand_STRAND_GEOMETRY,
	"MP":  graphpb.Strand_STRAND_PRACTICES,
}

// DomainCode returns the domain part of a Common Core code: "NF" for
// "4.NF.A.1", "MP" for "6.MP1" or "MP1", and "" for anything else.
func DomainCode(code string) string {
	parts := strings.Split(code, ".")
	for _, p := range parts {
		if strings.HasPrefix(p, "MP") {
			return "MP"
		}
	}
	if len(parts) < 2 {
		return ""
	}
	if _, ok := strands[parts[1]]; ok {
		return parts[1]
	}
	return ""
}

// deriveStrands sets strand and domain_code from each code. A standard with
// no code, such as a domain heading, takes them from its children when they
// all agree.
func deriveStrands(g *graphpb.Graph) {
	children := map[string][]*graphpb.Standard{}
	for _, s := range g.GetStandards() {
		children[s.GetParentId()] = append(children[s.GetParentId()], s)
		if d := DomainCode(s.GetCode()); d != "" {
			s.DomainCode = d
			s.Strand = strands[d]
		}
	}
	var fill func(s *graphpb.Standard) string
	fill = func(s *graphpb.Standard) string {
		if s.GetCode() != "" {
			return s.GetDomainCode()
		}
		domain, first := "", true
		for _, c := range children[s.GetId()] {
			d := fill(c)
			if first {
				domain, first = d, false
			} else if d != domain {
				domain = ""
			}
		}
		if domain != "" {
			s.DomainCode = domain
			s.Strand = strands[domain]
		}
		return domain
	}
	for _, s := range g.GetStandards() {
		if s.GetParentId() == "" {
			fill(s)
		}
	}
}

// schoolMonths is the number of months in the school year SchoolMonth names.
const schoolMonths = 10

// derivePace numbers each course's lessons in teaching order and sets the
// pace of every unit, section and lesson. It returns the lessons by id.
func derivePace(g *graphpb.Graph) map[string]*graphpb.CurriculumNode {
	children := map[string][]*graphpb.CurriculumNode{}
	lessons := map[string]*graphpb.CurriculumNode{}
	for _, c := range g.GetCurriculum() {
		children[c.GetParentId()] = append(children[c.GetParentId()], c)
		if c.GetLevel() == graphpb.CurriculumNode_LEVEL_LESSON {
			lessons[c.GetId()] = c
		}
	}
	for _, cs := range children {
		sort.SliceStable(cs, func(i, j int) bool {
			if cs[i].GetPosition() != cs[j].GetPosition() {
				return cs[i].GetPosition() < cs[j].GetPosition()
			}
			return cs[i].GetId() < cs[j].GetId()
		})
	}

	paced := func(c *graphpb.CurriculumNode) bool {
		switch c.GetLevel() {
		case graphpb.CurriculumNode_LEVEL_UNIT, graphpb.CurriculumNode_LEVEL_SECTION, graphpb.CurriculumNode_LEVEL_LESSON:
			return true
		}
		return false
	}

	for _, course := range g.GetCurriculum() {
		if course.GetLevel() != graphpb.CurriculumNode_LEVEL_COURSE {
			continue
		}
		// One instructional day per lesson. Activities and assessments sit
		// under lessons and units and take no day of their own.
		day := int32(0)
		var walk func(c *graphpb.CurriculumNode)
		walk = func(c *graphpb.CurriculumNode) {
			start := day
			if c.GetLevel() == graphpb.CurriculumNode_LEVEL_LESSON {
				day++
				c.Sequence = day
			} else {
				for _, k := range children[c.GetId()] {
					walk(k)
				}
			}
			if paced(c) {
				c.Pace = &graphpb.Pace{StartDay: start, Days: day - start}
			}
		}
		walk(course)

		total := day
		var months func(c *graphpb.CurriculumNode)
		months = func(c *graphpb.CurriculumNode) {
			if p := c.GetPace(); p != nil {
				setMonths(p, total)
			}
			for _, k := range children[c.GetId()] {
				months(k)
			}
		}
		months(course)
	}
	return lessons
}

// setMonths spreads a course of total days evenly over the school year.
func setMonths(p *graphpb.Pace, total int32) {
	if total == 0 {
		return
	}
	month := func(day int32) graphpb.SchoolMonth {
		m := 1 + day*schoolMonths/total
		if m > schoolMonths {
			m = schoolMonths
		}
		return graphpb.SchoolMonth(m)
	}
	last := p.GetStartDay() + p.GetDays() - 1
	if last < p.GetStartDay() {
		last = p.GetStartDay()
	}
	p.StartMonth = month(p.GetStartDay())
	p.EndMonth = month(last)
}

// placements finds where each course teaches each standard.
func placements(g *graphpb.Graph, lessons map[string]*graphpb.CurriculumNode) []*graphpb.Placement {
	nodes := map[string]*graphpb.CurriculumNode{}
	for _, c := range g.GetCurriculum() {
		nodes[c.GetId()] = c
	}
	stds := map[string]*graphpb.Standard{}
	for _, s := range g.GetStandards() {
		stds[s.GetId()] = s
	}

	lessonOf := func(id string) *graphpb.CurriculumNode {
		for i := 0; i < 8 && id != ""; i++ {
			c := nodes[id]
			if c == nil {
				return nil
			}
			switch c.GetLevel() {
			case graphpb.CurriculumNode_LEVEL_LESSON:
				return c
			case graphpb.CurriculumNode_LEVEL_ACTIVITY:
				id = c.GetParentId()
			default:
				return nil
			}
		}
		return nil
	}
	unitOf := func(c *graphpb.CurriculumNode) *graphpb.CurriculumNode {
		for i := 0; i < 8 && c != nil; i++ {
			if c.GetLevel() == graphpb.CurriculumNode_LEVEL_UNIT {
				return c
			}
			c = nodes[c.GetParentId()]
		}
		return nil
	}

	// addressed[standard][lesson]
	addressed := map[string]map[string]bool{}
	for _, l := range g.GetLinks() {
		if l.GetKind() != graphpb.Link_KIND_ALIGNED_TO || l.GetAlignment() != graphpb.Link_ALIGNMENT_ADDRESSING {
			continue
		}
		lesson := lessonOf(l.GetFromId())
		if lesson == nil {
			continue
		}
		// A lesson on a lettered part also addresses the part's parent.
		for s := stds[l.GetToId()]; s != nil && s.GetKind() == graphpb.Standard_KIND_STANDARD; s = stds[s.GetParentId()] {
			if addressed[s.GetId()] == nil {
				addressed[s.GetId()] = map[string]bool{}
			}
			addressed[s.GetId()][lesson.GetId()] = true
		}
	}

	var out []*graphpb.Placement
	for sid, ls := range addressed {
		byUnit := map[string][]*graphpb.CurriculumNode{}
		for lid := range ls {
			lesson := lessons[lid]
			if u := unitOf(lesson); u != nil {
				byUnit[u.GetId()] = append(byUnit[u.GetId()], lesson)
			}
		}
		var ps []*graphpb.Placement
		for uid, unitLessons := range byUnit {
			sort.Slice(unitLessons, func(i, j int) bool { return unitLessons[i].GetSequence() < unitLessons[j].GetSequence() })
			first, last := unitLessons[0], unitLessons[len(unitLessons)-1]
			p := &graphpb.Placement{
				StandardId: sid,
				CourseCode: nodes[uid].GetCourseCode(),
				UnitId:     uid,
				Role:       graphpb.Placement_ROLE_ALSO,
				Pace: &graphpb.Pace{
					StartDay: first.GetPace().GetStartDay(),
					Days:     last.GetPace().GetStartDay() + 1 - first.GetPace().GetStartDay(),
				},
			}
			for _, l := range unitLessons {
				p.LessonIds = append(p.LessonIds, l.GetId())
			}
			ps = append(ps, p)
		}
		if len(ps) == 0 {
			continue
		}
		main := ps[0]
		for _, p := range ps[1:] {
			if better(p, main, stds[sid], nodes) {
				main = p
			}
		}
		main.Role = graphpb.Placement_ROLE_MAIN
		out = append(out, ps...)
	}

	// Months need each course's length.
	total := map[string]int32{}
	for _, c := range g.GetCurriculum() {
		if c.GetLevel() == graphpb.CurriculumNode_LEVEL_COURSE {
			for _, k := range g.GetCurriculum() {
				if k.GetLevel() == graphpb.CurriculumNode_LEVEL_LESSON && k.GetCourseCode() == c.GetCourseCode() {
					total[c.GetCourseCode()]++
				}
			}
		}
	}
	for _, p := range out {
		setMonths(p.GetPace(), total[p.GetCourseCode()])
	}

	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.GetStandardId() != b.GetStandardId() {
			return a.GetStandardId() < b.GetStandardId()
		}
		if a.GetCourseCode() != b.GetCourseCode() {
			return a.GetCourseCode() < b.GetCourseCode()
		}
		return a.GetPace().GetStartDay() < b.GetPace().GetStartDay()
	})
	return out
}

// better reports whether placement a should be the main one rather than b:
// a course for the standard's own grade first, then more lessons, then the
// earlier unit.
func better(a, b *graphpb.Placement, s *graphpb.Standard, nodes map[string]*graphpb.CurriculumNode) bool {
	own := func(p *graphpb.Placement) bool {
		for _, cg := range nodes[p.GetUnitId()].GetGrades() {
			for _, sg := range s.GetGrades() {
				if cg == sg {
					return true
				}
			}
		}
		return false
	}
	if oa, ob := own(a), own(b); oa != ob {
		return oa
	}
	if len(a.GetLessonIds()) != len(b.GetLessonIds()) {
		return len(a.GetLessonIds()) > len(b.GetLessonIds())
	}
	if a.GetCourseCode() != b.GetCourseCode() {
		return a.GetCourseCode() < b.GetCourseCode()
	}
	return a.GetPace().GetStartDay() < b.GetPace().GetStartDay()
}
