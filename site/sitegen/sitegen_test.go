package sitegen

import (
	"fmt"
	"strings"
	"testing"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

// stepsGraph has one grade 4 standard, 4.NF.B.3, with ten supporting
// components and one more whose description repeats the first's.
func stepsGraph() (*graphpb.Graph, *graphpb.CuratedLayer) {
	g := &graphpb.Graph{Standards: []*graphpb.Standard{
		{Id: "s", Code: "4.NF.B.3", Kind: graphpb.Standard_KIND_STANDARD, Grades: []string{"4"}, Strand: graphpb.Strand_STRAND_FRACTIONS_AND_RATIOS},
		{Id: "r", Code: "3.NF.A.1", Kind: graphpb.Standard_KIND_STANDARD, Grades: []string{"3"}, Strand: graphpb.Strand_STRAND_FRACTIONS_AND_RATIOS},
	}}
	for i := 0; i < 10; i++ {
		id := fmt.Sprintf("c%d", i)
		g.Components = append(g.Components, &graphpb.Component{Id: id, Description: fmt.Sprintf("Step %d", i)})
		g.Links = append(g.Links, &graphpb.Link{FromId: id, ToId: "s", Kind: graphpb.Link_KIND_SUPPORTS})
	}
	g.Components = append(g.Components, &graphpb.Component{Id: "dup", Description: "Step 0 (denominators limited to 2, 3 and 4)"})
	g.Links = append(g.Links, &graphpb.Link{FromId: "dup", ToId: "s", Kind: graphpb.Link_KIND_SUPPORTS})
	c := &graphpb.CuratedLayer{
		Standards: []*graphpb.CuratedStandard{
			{StandardId: "s", Code: "4.NF.B.3", Name: "Adding fractions"},
			{StandardId: "r", Code: "3.NF.A.1", Name: "Unit fractions"},
		},
		Components: []*graphpb.CuratedComponent{{ComponentId: "c9", Name: "Ninth step"}},
	}
	return g, c
}

func TestStepsKeepWhatWorksheetsPractise(t *testing.T) {
	g, c := stepsGraph()
	sheets := []Sheet{
		{ID: "ws-review", Parts: []SheetPart{{Where: "Part A, problems 1–2", Standards: []Aligned{{"4.NF.B.3", RoleReviews}}}}},
		{ID: "ws-main", Parts: []SheetPart{
			{Where: "Part A, problems 1–4", Standards: []Aligned{{"4.NF.B.3", RolePractises}}, Components: []string{"c9", "dup"}},
			{Where: "Part B, problem 5", Standards: []Aligned{{"4.NF.B.3", RoleTeaches}}},
		}},
	}
	s, err := Build(g, c, sheets)
	if err != nil {
		t.Fatal(err)
	}
	var sk *skill
	for i := range s.Skills {
		if s.Skills[i].Code == "4.NF.B.3" {
			sk = &s.Skills[i]
		}
	}
	if len(sk.Steps) != maxComponents {
		t.Fatalf("%d steps, want %d", len(sk.Steps), maxComponents)
	}
	byID := map[string]step{}
	for _, st := range sk.Steps {
		byID[st.ID] = st
	}
	// c9 is past the cap but a worksheet practises it; dup shares c0's
	// description, so it is listed as c0.
	if byID["c9"].Name != "Ninth step" || byID["c9"].Text != "Step 9" {
		t.Errorf("c9 = %+v, want the curated name and its description", byID["c9"])
	}
	if byID["c0"].Name != "Step 0" {
		t.Errorf("c0 = %+v, want its description as its name", byID["c0"])
	}
	if len(sk.Worksheets) != 2 || sk.Worksheets[0].ID != "ws-main" || sk.Worksheets[1].ID != "ws-review" {
		t.Fatalf("worksheets = %+v, want ws-main then ws-review", sk.Worksheets)
	}
	main := sk.Worksheets[0]
	if main.Role != "teaches" || sk.Worksheets[1].Role != "reviews" {
		t.Errorf("roles = %s, %s; want teaches, reviews", main.Role, sk.Worksheets[1].Role)
	}
	var got []string
	for _, ws := range main.Steps {
		if _, ok := byID[ws.StepID]; !ok {
			t.Errorf("worksheet step %s is not one of the skill's steps", ws.StepID)
		}
		got = append(got, ws.StepID+"@"+ws.Where)
	}
	if strings.Join(got, ",") != "c9@Part A, problems 1–4,c0@Part A, problems 1–4" {
		t.Errorf("worksheet steps = %v", got)
	}
}
