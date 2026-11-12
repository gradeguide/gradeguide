package lcimport

import (
	"os"
	"strings"
	"testing"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

func importFixture(t *testing.T, opts ...Option) *graphpb.Graph {
	t.Helper()
	nodes, err := os.Open("testdata/nodes.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	defer nodes.Close()
	rels, err := os.Open("testdata/relationships.jsonl")
	if err != nil {
		t.Fatal(err)
	}
	defer rels.Close()
	g, err := Import(nodes, rels, opts...)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func ids[T interface{ GetId() string }](items []T) []string {
	var out []string
	for _, x := range items {
		out = append(out, x.GetId())
	}
	return out
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func standard(g *graphpb.Graph, id string) *graphpb.Standard {
	for _, s := range g.GetStandards() {
		if s.GetId() == id {
			return s
		}
	}
	return nil
}

func TestImportKeepsTheFilteredSubjectAndJurisdiction(t *testing.T) {
	g := importFixture(t, WithCourses("im360:4"))

	if got, want := ids(g.GetFrameworks()), []string{"fw-ccss"}; !equal(got, want) {
		t.Errorf("frameworks = %v, want %v (Texas is another jurisdiction)", got, want)
	}
	if got, want := ids(g.GetStandards()), []string{"g-4nf", "s-3nfa3", "s-4nfa1"}; !equal(got, want) {
		t.Errorf("standards = %v, want %v (English and Texas are dropped)", got, want)
	}
	if got, want := ids(g.GetComponents()), []string{"lc-1"}; !equal(got, want) {
		t.Errorf("components = %v, want %v (a component supporting only a dropped standard is dropped)", got, want)
	}
	if got, want := ids(g.GetCurriculum()), []string{"c-4", "l-1", "u-2"}; !equal(got, want) {
		t.Errorf("curriculum = %v, want %v (only the requested course)", got, want)
	}
	if got, want := ids(g.GetMisconceptions()), []string{"mis-1"}; !equal(got, want) {
		t.Errorf("misconceptions = %v, want %v", got, want)
	}
}

func TestImportTurnsContainmentIntoParentFields(t *testing.T) {
	g := importFixture(t)

	s := standard(g, "s-4nfa1")
	if s.GetFrameworkId() != "fw-ccss" || s.GetParentId() != "g-4nf" {
		t.Errorf("4.NF.A.1 framework, parent = %q, %q; want fw-ccss, g-4nf", s.GetFrameworkId(), s.GetParentId())
	}
	if top := standard(g, "s-3nfa3"); top.GetParentId() != "" || top.GetFrameworkId() != "fw-ccss" {
		t.Errorf("3.NF.A.3 parent, framework = %q, %q; a framework's direct child has no parent standard", top.GetParentId(), top.GetFrameworkId())
	}
	for _, l := range g.GetLinks() {
		if l.GetKind() == graphpb.Link_KIND_UNKNOWN {
			t.Errorf("link %s -> %s has no kind; containment should not become a link", l.GetFromId(), l.GetToId())
		}
	}
}

func TestImportCarriesFieldsAndAttribution(t *testing.T) {
	g := importFixture(t)

	s := standard(g, "s-4nfa1")
	if s.GetCode() != "4.NF.A.1" || s.GetKind() != graphpb.Standard_KIND_STANDARD || s.GetAdoption() != graphpb.Standard_ADOPTION_ADOPTED {
		t.Errorf("4.NF.A.1 = %v", s)
	}
	if s.GetSourceIds().GetLearningCommons() != "s-4nfa1" || s.GetSourceIds().GetCaseUuid() != "case-4nfa1" {
		t.Errorf("source ids = %v", s.GetSourceIds())
	}
	if a := s.GetAttribution(); a.GetAuthor() != "Common Good Learning Tools" || a.GetStatement() != "CCSS credit." || a.GetLicenseUrl() == "" {
		t.Errorf("attribution = %v", a)
	}
	if m := s.GetMastery(); m.GetAlignedItemCount() != 22 || m.GetThreshold_67() != 0.24 || m.GetAttribution().GetAuthor() != "New Meridian Corporation" {
		t.Errorf("mastery = %v", m)
	}
	if got := standard(g, "g-4nf").GetKind(); got != graphpb.Standard_KIND_GROUPING {
		t.Errorf("4.NF kind = %v, want grouping", got)
	}
	c := g.GetComponents()[0]
	if len(c.GetExamples()) != 1 || c.GetExamples()[0] != "1/2 = 2/4" {
		t.Errorf("component examples = %q", c.GetExamples())
	}
}

func TestImportKeepsTypedLinksBetweenKeptRecords(t *testing.T) {
	g := importFixture(t, WithCourses("im360:4"))

	type key struct {
		from, to string
		kind     graphpb.Link_Kind
	}
	got := map[key]*graphpb.Link{}
	for _, l := range g.GetLinks() {
		got[key{l.GetFromId(), l.GetToId(), l.GetKind()}] = l
	}
	for _, k := range []key{
		{"lc-1", "s-4nfa1", graphpb.Link_KIND_SUPPORTS},
		{"s-3nfa3", "s-4nfa1", graphpb.Link_KIND_BUILDS_TOWARDS},
		{"l-1", "s-4nfa1", graphpb.Link_KIND_ALIGNED_TO},
		{"mis-1", "con-1", graphpb.Link_KIND_HINDERS},
	} {
		if got[k] == nil {
			t.Errorf("missing link %v", k)
		}
	}
	if len(got) != 4 {
		t.Errorf("got %d links, want 4: the Texas alignment and the grade 5 course are dropped", len(got))
	}
	if a := got[key{"l-1", "s-4nfa1", graphpb.Link_KIND_ALIGNED_TO}].GetAlignment(); a != graphpb.Link_ALIGNMENT_ADDRESSING {
		t.Errorf("lesson alignment = %v, want addressing", a)
	}
	if a := got[key{"s-3nfa3", "s-4nfa1", graphpb.Link_KIND_BUILDS_TOWARDS}].GetAttribution().GetAuthor(); a != "Student Achievement Partners" {
		t.Errorf("prerequisite link author = %q", a)
	}

	var lesson *graphpb.CurriculumNode
	for _, n := range g.GetCurriculum() {
		if n.GetId() == "l-1" {
			lesson = n
		}
	}
	if lesson.GetLevel() != graphpb.CurriculumNode_LEVEL_LESSON || lesson.GetParentId() != "u-2" || lesson.GetTimeRequired() != "PT45M" {
		t.Errorf("lesson = %v", lesson)
	}
}

func TestImportFiltersByGrade(t *testing.T) {
	g := importFixture(t, WithGrades("3"))

	if got, want := ids(g.GetStandards()), []string{"s-3nfa3"}; !equal(got, want) {
		t.Errorf("standards = %v, want %v", got, want)
	}
	if len(g.GetComponents()) != 0 {
		t.Errorf("components = %v, want none: lc-1 supports only grade 4", ids(g.GetComponents()))
	}
}

func TestImportReportsTheBadLine(t *testing.T) {
	_, err := Import(strings.NewReader("{\"identifier\":\"x\"}\nnot json\n"), strings.NewReader(""))
	if err == nil || !strings.Contains(err.Error(), "line 2") {
		t.Errorf("err = %v, want one naming line 2", err)
	}
}
