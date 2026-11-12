package worksheets

import (
	"strings"
	"testing"
	"testing/fstest"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
	worksheetpb "github.com/gradeguide/gradeguide/worksheet/proto/v1"
)

// A graph with one standard, one component that supports it, and one that
// supports nothing here.
func testGraph() *graphpb.Graph {
	return &graphpb.Graph{
		Standards: []*graphpb.Standard{
			{Id: "s1", Code: "4.NF.A.1", Kind: graphpb.Standard_KIND_STANDARD},
			{Id: "c-4.NF.A", Code: "4.NF.A", Kind: graphpb.Standard_KIND_GROUPING},
		},
		Components: []*graphpb.Component{{Id: "comp1"}, {Id: "comp2"}},
		Links:      []*graphpb.Link{{FromId: "comp1", ToId: "s1", Kind: graphpb.Link_KIND_SUPPORTS}},
	}
}

func lib(fragments ...string) *worksheetpb.Library {
	l := &worksheetpb.Library{}
	ws := &worksheetpb.Worksheet{Id: "ws"}
	for _, f := range fragments {
		l.Fragments = append(l.Fragments, &worksheetpb.Fragment{Id: f})
		ws.Placements = append(ws.Placements, &worksheetpb.Placement{FragmentId: f})
	}
	l.Worksheets = []*worksheetpb.Worksheet{ws}
	return l
}

func code(fragment, c string, role graphpb.WorksheetAlignment_Role) *graphpb.WorksheetAlignment {
	return &graphpb.WorksheetAlignment{FragmentId: fragment, Skill: &graphpb.SkillRef{Code: c}, Role: role}
}

func component(fragment, id string) *graphpb.WorksheetAlignment {
	return &graphpb.WorksheetAlignment{FragmentId: fragment, Skill: &graphpb.SkillRef{Skill: &graphpb.SkillRef_ComponentId{ComponentId: id}}, Role: graphpb.WorksheetAlignment_ROLE_TEACHES}
}

func TestCheckAcceptsResolvedAlignments(t *testing.T) {
	al := &graphpb.WorksheetAlignments{Alignments: []*graphpb.WorksheetAlignment{
		code("f", "4.NF.A.1", graphpb.WorksheetAlignment_ROLE_TEACHES),
		component("f", "comp1"),
	}}
	if errs := Check(testGraph(), lib("f"), al); len(errs) > 0 {
		t.Errorf("Check = %v, want no problems", errs)
	}
}

func TestCheckRejects(t *testing.T) {
	for _, tc := range []struct {
		name string
		al   *graphpb.WorksheetAlignment
		want string
	}{
		{"unknown code", code("f", "9.ZZ.Z.9", graphpb.WorksheetAlignment_ROLE_TEACHES), "not in the graph"},
		{"a grouping", code("f", "4.NF.A", graphpb.WorksheetAlignment_ROLE_TEACHES), "not a standard"},
		{"no role", code("f", "4.NF.A.1", graphpb.WorksheetAlignment_ROLE_UNSPECIFIED), "no role"},
		{"unknown fragment", code("nope", "4.NF.A.1", graphpb.WorksheetAlignment_ROLE_TEACHES), "not in the catalogue"},
		{"unknown component", component("f", "comp9"), "not in the graph"},
		{"unrelated component", component("f", "comp2"), "supports none"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			al := &graphpb.WorksheetAlignments{Alignments: []*graphpb.WorksheetAlignment{
				code("f", "4.NF.A.1", graphpb.WorksheetAlignment_ROLE_TEACHES), tc.al,
			}}
			errs := Check(testGraph(), lib("f"), al)
			if len(errs) != 1 || !strings.Contains(errs[0].Error(), tc.want) {
				t.Errorf("Check = %v, want one problem containing %q", errs, tc.want)
			}
		})
	}
}

func TestCheckRejectsAnUnalignedPlacedFragment(t *testing.T) {
	al := &graphpb.WorksheetAlignments{Alignments: []*graphpb.WorksheetAlignment{
		code("f", "4.NF.A.1", graphpb.WorksheetAlignment_ROLE_TEACHES),
	}}
	errs := Check(testGraph(), lib("f", "g"), al)
	if len(errs) != 1 || !strings.Contains(errs[0].Error(), "aligned to no standard") {
		t.Errorf("Check = %v, want one problem for g", errs)
	}
}

func TestFillHeaderLabelsPutsReviewsLast(t *testing.T) {
	l := lib("f")
	FillHeaderLabels(l, &graphpb.WorksheetAlignments{Alignments: []*graphpb.WorksheetAlignment{
		code("f", "3.NF.A.1", graphpb.WorksheetAlignment_ROLE_REVIEWS),
		code("f", "4.NF.A.1", graphpb.WorksheetAlignment_ROLE_TEACHES),
		code("f", "4.NF.A.1", graphpb.WorksheetAlignment_ROLE_PRACTISES),
		component("f", "comp1"),
	}})
	got := strings.Join(l.GetFragments()[0].GetHeaderLabels(), ",")
	if got != "4.NF.A.1,3.NF.A.1" {
		t.Errorf("header labels = %s, want 4.NF.A.1,3.NF.A.1", got)
	}
}

func TestLoadSplitsLibraryFromAlignments(t *testing.T) {
	fsys := fstest.MapFS{
		"a.textproto":          {Data: []byte(`fragments { id: "f" }`)},
		"b.textproto":          {Data: []byte(`worksheets { id: "ws" placements { fragment_id: "f" } }`)},
		"alignments.textproto": {Data: []byte(`alignments { fragment_id: "f" skill { code: "4.NF.A.1" } role: ROLE_TEACHES }`)},
	}
	l, err := LoadLibrary(fsys)
	if err != nil || len(l.GetFragments()) != 1 || len(l.GetWorksheets()) != 1 {
		t.Fatalf("LoadLibrary = %v, %v", l, err)
	}
	al, err := LoadAlignments(fsys)
	if err != nil || len(al.GetAlignments()) != 1 {
		t.Fatalf("LoadAlignments = %v, %v", al, err)
	}
}
