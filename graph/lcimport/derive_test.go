package lcimport

import (
	"encoding/json"
	"strings"
	"testing"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

// courseFixture is a small download with two courses, written out in Go so
// each test can see the structure it relies on:
//
//	im360:4                      im360:5
//	  unit-a (position 0)          unit-5
//	    sec-1: les-1, les-2          sec-5: les-5a, les-5b, les-5c
//	  unit-b (position 1, optional)
//	    sec-2: les-4 (position 0), les-3 (position 1, with act-3)
//
// Standards: a domain heading with no code, the standard 4.NF.B.3 under it,
// and its lettered part 4.NF.B.3.a.
type courseFixture struct {
	nodes, rels []string
	n           int
}

func (f *courseFixture) node(id, label string, props map[string]string) {
	props["academicSubject"] = "Mathematics"
	b, _ := json.Marshal(map[string]any{"type": "node", "identifier": id, "labels": []string{label}, "properties": props})
	f.nodes = append(f.nodes, string(b))
}

func (f *courseFixture) rel(label, from, to string, props map[string]string) {
	f.n++
	if props == nil {
		props = map[string]string{}
	}
	b, _ := json.Marshal(map[string]any{"type": "relationship", "label": label, "source_identifier": from, "target_identifier": to, "properties": props})
	f.rels = append(f.rels, string(b))
}

func (f *courseFixture) curriculum(id, label, course, parent string, position int, extra map[string]string) {
	props := map[string]string{"courseCode": course, "position": itoa(position), "gradeLevel": `["` + strings.TrimPrefix(course, "im360:") + `"]`}
	for k, v := range extra {
		props[k] = v
	}
	f.node(id, label, props)
	if parent != "" {
		f.rel("hasPart", parent, id, nil)
	}
}

func (f *courseFixture) addresses(from, standard string) {
	f.rel("hasEducationalAlignment", from, standard, map[string]string{"curriculumAlignmentType": "addressing"})
}

func itoa(i int) string { b, _ := json.Marshal(i); return string(b) }

func importCourses(t *testing.T) *graphpb.Graph {
	t.Helper()
	f := &courseFixture{}
	cc := map[string]string{"jurisdiction": "Multi-State"}
	f.node("fw", "StandardsFramework", cc)
	std := func(id, code, kind string) map[string]string {
		return map[string]string{"jurisdiction": "Multi-State", "statementCode": code, "normalizedStatementType": kind, "gradeLevel": `["4"]`}
	}
	f.node("dom", "StandardsFrameworkItem", std("dom", "", "Standard Grouping"))
	f.node("s", "StandardsFrameworkItem", std("s", "4.NF.B.3", "Standard"))
	f.node("p", "StandardsFrameworkItem", std("p", "4.NF.B.3.a", "Standard"))
	f.rel("hasChild", "fw", "dom", nil)
	f.rel("hasChild", "dom", "s", nil)
	f.rel("hasChild", "s", "p", nil)

	f.curriculum("c4", "Course", "im360:4", "", 0, nil)
	f.curriculum("unit-a", "LessonGrouping", "im360:4", "c4", 0, map[string]string{"groupName": "unit"})
	f.curriculum("unit-b", "LessonGrouping", "im360:4", "c4", 1, map[string]string{"groupName": "unit", "isOptional": "true"})
	f.curriculum("sec-1", "LessonGrouping", "im360:4", "unit-a", 0, map[string]string{"groupName": "section"})
	f.curriculum("sec-2", "LessonGrouping", "im360:4", "unit-b", 0, map[string]string{"groupName": "section"})
	f.curriculum("les-1", "Lesson", "im360:4", "sec-1", 0, nil)
	f.curriculum("les-2", "Lesson", "im360:4", "sec-1", 1, nil)
	f.curriculum("les-3", "Lesson", "im360:4", "sec-2", 1, nil)
	f.curriculum("les-4", "Lesson", "im360:4", "sec-2", 0, nil)
	f.curriculum("act-3", "Activity", "im360:4", "les-3", 0, nil)

	f.curriculum("c5", "Course", "im360:5", "", 0, nil)
	f.curriculum("unit-5", "LessonGrouping", "im360:5", "c5", 0, map[string]string{"groupName": "unit"})
	f.curriculum("sec-5", "LessonGrouping", "im360:5", "unit-5", 0, map[string]string{"groupName": "section"})
	for i, id := range []string{"les-5a", "les-5b", "les-5c"} {
		f.curriculum(id, "Lesson", "im360:5", "sec-5", i, nil)
		f.addresses(id, "s")
	}

	f.addresses("les-1", "s")
	f.addresses("act-3", "p")
	f.addresses("les-4", "p")
	// Building toward is not teaching, so it places nothing.
	f.rel("hasEducationalAlignment", "les-2", "s", map[string]string{"curriculumAlignmentType": "building_toward"})

	g, err := Import(strings.NewReader(strings.Join(f.nodes, "\n")), strings.NewReader(strings.Join(f.rels, "\n")),
		WithCourses("im360:4", "im360:5"))
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func curriculumNode(g *graphpb.Graph, id string) *graphpb.CurriculumNode {
	for _, c := range g.GetCurriculum() {
		if c.GetId() == id {
			return c
		}
	}
	return nil
}

func TestDeriveStrandFromCodeAndChildren(t *testing.T) {
	g := importCourses(t)
	for _, id := range []string{"dom", "s", "p"} {
		s := standard(g, id)
		if s.GetStrand() != graphpb.Strand_STRAND_FRACTIONS_AND_RATIOS || s.GetDomainCode() != "NF" {
			t.Errorf("%s: strand %v, domain %q; want fractions and ratios, NF", id, s.GetStrand(), s.GetDomainCode())
		}
	}
}

func TestDomainCode(t *testing.T) {
	for code, want := range map[string]string{
		"4.NF.A.1": "NF", "K.CC.A": "CC", "8.F.B.4": "F", "6.MP1": "MP", "MP3": "MP", "4.3C": "", "": "",
	} {
		if got := DomainCode(code); got != want {
			t.Errorf("DomainCode(%q) = %q, want %q", code, got, want)
		}
	}
}

func TestDeriveSequenceFollowsPositionsNotFileOrder(t *testing.T) {
	g := importCourses(t)
	want := map[string]int32{"les-1": 1, "les-2": 2, "les-4": 3, "les-3": 4, "les-5a": 1, "les-5c": 3}
	for id, seq := range want {
		if got := curriculumNode(g, id).GetSequence(); got != seq {
			t.Errorf("%s sequence = %d, want %d", id, got, seq)
		}
	}
	if got := curriculumNode(g, "unit-b").GetOptionality(); got != graphpb.CurriculumNode_OPTIONALITY_OPTIONAL {
		t.Errorf("unit-b optionality = %v, want optional", got)
	}
	if got := curriculumNode(g, "unit-a").GetOptionality(); got != graphpb.CurriculumNode_OPTIONALITY_UNKNOWN {
		t.Errorf("unit-a optionality = %v, want unknown (the source did not say)", got)
	}
}

func TestDerivePaceSpreadsTheCourseOverTheSchoolYear(t *testing.T) {
	g := importCourses(t)
	// Four lessons over ten months: days 0, 1, 2 and 3 start in months 1, 3,
	// 6 and 8.
	for id, want := range map[string]*graphpb.Pace{
		"unit-a": {StartDay: 0, Days: 2, StartMonth: graphpb.SchoolMonth_SCHOOL_MONTH_SEPTEMBER, EndMonth: graphpb.SchoolMonth_SCHOOL_MONTH_NOVEMBER},
		"unit-b": {StartDay: 2, Days: 2, StartMonth: graphpb.SchoolMonth_SCHOOL_MONTH_FEBRUARY, EndMonth: graphpb.SchoolMonth_SCHOOL_MONTH_APRIL},
		"les-3":  {StartDay: 3, Days: 1, StartMonth: graphpb.SchoolMonth_SCHOOL_MONTH_APRIL, EndMonth: graphpb.SchoolMonth_SCHOOL_MONTH_APRIL},
	} {
		got := curriculumNode(g, id).GetPace()
		if got.GetStartDay() != want.GetStartDay() || got.GetDays() != want.GetDays() ||
			got.GetStartMonth() != want.GetStartMonth() || got.GetEndMonth() != want.GetEndMonth() {
			t.Errorf("%s pace = %v, want %v", id, got, want)
		}
	}
	if curriculumNode(g, "c4").GetPace() != nil || curriculumNode(g, "act-3").GetPace() != nil {
		t.Error("courses and activities should have no pace")
	}
}

func TestDerivePlacements(t *testing.T) {
	g := importCourses(t)
	type key struct{ standard, unit string }
	got := map[key]*graphpb.Placement{}
	for _, p := range g.GetPlacements() {
		got[key{p.GetStandardId(), p.GetUnitId()}] = p
	}

	// The standard: one lesson in unit-a, two in unit-b (one through a
	// lettered part, one through an activity of a lesson), three in the grade
	// 5 course. Its own grade's course wins over the larger count.
	cases := []struct {
		k       key
		role    graphpb.Placement_Role
		lessons []string
	}{
		{key{"s", "unit-a"}, graphpb.Placement_ROLE_ALSO, []string{"les-1"}},
		{key{"s", "unit-b"}, graphpb.Placement_ROLE_MAIN, []string{"les-4", "les-3"}},
		{key{"s", "unit-5"}, graphpb.Placement_ROLE_ALSO, []string{"les-5a", "les-5b", "les-5c"}},
		{key{"p", "unit-b"}, graphpb.Placement_ROLE_MAIN, []string{"les-4", "les-3"}},
	}
	if len(got) != len(cases) {
		t.Errorf("got %d placements, want %d: %v", len(got), len(cases), g.GetPlacements())
	}
	for _, c := range cases {
		p := got[c.k]
		if p == nil {
			t.Errorf("no placement for %v", c.k)
			continue
		}
		if p.GetRole() != c.role || !equal(p.GetLessonIds(), c.lessons) {
			t.Errorf("%v: role %v lessons %v, want %v %v", c.k, p.GetRole(), p.GetLessonIds(), c.role, c.lessons)
		}
	}
	if p := got[key{"s", "unit-b"}]; p.GetPace().GetStartDay() != 2 || p.GetPace().GetDays() != 2 || p.GetCourseCode() != "im360:4" {
		t.Errorf("s in unit-b: course %q pace %v, want im360:4 from day 2 for 2 days", p.GetCourseCode(), p.GetPace())
	}
	if standard(g, "dom") == nil {
		t.Fatal("domain heading dropped")
	}
	for _, p := range g.GetPlacements() {
		if p.GetStandardId() == "dom" {
			t.Error("a grouping got a placement")
		}
	}
}
