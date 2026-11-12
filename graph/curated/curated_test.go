package curated

import (
	"strings"
	"testing"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

func TestCheckedInMathLayerIsConsistent(t *testing.T) {
	layer := mathLayer(t)
	for _, err := range CheckLayer(layer) {
		t.Error(err)
	}
	if len(layer.GetStandards()) == 0 || len(layer.GetTopics()) == 0 {
		t.Errorf("loaded %d standards and %d topics; want some of each", len(layer.GetStandards()), len(layer.GetTopics()))
	}
}

// smallGraph has one cluster, 4.NF.A, holding the standard 4.NF.A.1 and its
// part 4.NF.A.1.a, a practice standard, and one component.
func smallGraph() *graphpb.Graph {
	fr := graphpb.Strand_STRAND_FRACTIONS_AND_RATIOS
	return &graphpb.Graph{
		Standards: []*graphpb.Standard{
			{Id: "cl", Code: "4.NF.A", Kind: graphpb.Standard_KIND_GROUPING, StatementType: "Cluster", Strand: fr},
			{Id: "s1", Code: "4.NF.A.1", Kind: graphpb.Standard_KIND_STANDARD, ParentId: "cl", Strand: fr},
			{Id: "s1a", Code: "4.NF.A.1.a", Kind: graphpb.Standard_KIND_STANDARD, ParentId: "s1", Strand: fr},
			{Id: "mp", Code: "4.MP1", Kind: graphpb.Standard_KIND_STANDARD, Strand: graphpb.Strand_STRAND_PRACTICES},
		},
		Components: []*graphpb.Component{{Id: "lc"}},
	}
}

func draft() *graphpb.Review { return &graphpb.Review{Status: graphpb.Review_STATUS_DRAFT} }

func entry(id, code string) *graphpb.CuratedStandard {
	return &graphpb.CuratedStandard{
		StandardId: id, Code: code, Name: "n", Explanation: "e", Example: "x", TryAtHome: "t", Review: draft(),
	}
}

// goodLayer is a complete, correct layer for smallGraph.
func goodLayer() *graphpb.CuratedLayer {
	l := &graphpb.CuratedLayer{
		Topics: []*graphpb.Topic{{
			Id: "fractions", Strand: graphpb.Strand_STRAND_FRACTIONS_AND_RATIOS, Name: "Fractions",
			ClusterCodes: []string{"4.NF.A"}, Review: draft(),
		}},
		Standards:  []*graphpb.CuratedStandard{entry("s1", "4.NF.A.1"), entry("s1a", "4.NF.A.1.a")},
		Components: []*graphpb.CuratedComponent{{ComponentId: "lc", Name: "c", Review: draft()}},
	}
	for v := range graphpb.Strand_name {
		if v != 0 {
			l.Strands = append(l.Strands, &graphpb.CuratedStrand{Strand: graphpb.Strand(v), Name: "n", Description: "d", Review: draft()})
		}
	}
	return l
}

func TestCheckAcceptsACompleteLayer(t *testing.T) {
	for _, err := range Check(smallGraph(), goodLayer()) {
		t.Error(err)
	}
}

func TestCheckFindsEachProblem(t *testing.T) {
	cases := []struct {
		name   string
		change func(l *graphpb.CuratedLayer)
		want   string
	}{
		{"missing standard", func(l *graphpb.CuratedLayer) { l.Standards = l.Standards[:1] }, "standard 4.NF.A.1.a: no curated entry"},
		{"unknown id", func(l *graphpb.CuratedLayer) { l.Standards[0].StandardId = "gone" }, "id gone is not in the graph"},
		{"code does not match id", func(l *graphpb.CuratedLayer) { l.Standards[0].Code = "4.NF.A.2" }, "id s1 is 4.NF.A.1 in the graph"},
		{"entry for a grouping", func(l *graphpb.CuratedLayer) {
			l.Standards = append(l.Standards, entry("cl", "4.NF.A"))
		}, "not a standard"},
		{"duplicate", func(l *graphpb.CuratedLayer) { l.Standards = append(l.Standards, entry("s1", "4.NF.A.1")) }, "listed twice"},
		{"empty text", func(l *graphpb.CuratedLayer) { l.Standards[0].TryAtHome = " " }, "no try_at_home"},
		{"no review status", func(l *graphpb.CuratedLayer) { l.Standards[0].Review = nil }, "no review status"},
		{"reviewed without a reviewer", func(l *graphpb.CuratedLayer) {
			l.Standards[0].Review = &graphpb.Review{Status: graphpb.Review_STATUS_REVIEWED}
		}, "needs a reviewer and a date"},
		{"cluster in no topic", func(l *graphpb.CuratedLayer) { l.Topics = nil }, "cluster 4.NF.A: in no topic"},
		{"cluster in two topics", func(l *graphpb.CuratedLayer) {
			l.Topics = append(l.Topics, &graphpb.Topic{Id: "again", Strand: graphpb.Strand_STRAND_FRACTIONS_AND_RATIOS, Name: "x", ClusterCodes: []string{"4.NF.A"}, Review: draft()})
		}, "already in topic"},
		{"topic in the wrong strand", func(l *graphpb.CuratedLayer) { l.Topics[0].Strand = graphpb.Strand_STRAND_GEOMETRY }, "is in strand"},
		{"topic names a standard", func(l *graphpb.CuratedLayer) { l.Topics[0].ClusterCodes = []string{"4.NF.A", "4.NF.A.1"} }, "not a cluster"},
		{"strand with no entry", func(l *graphpb.CuratedLayer) { l.Strands = l.Strands[1:] }, "no entry"},
		{"unknown component", func(l *graphpb.CuratedLayer) { l.Components[0].ComponentId = "gone" }, "component gone: not in the graph"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			l := goodLayer()
			c.change(l)
			errs := Check(smallGraph(), l)
			for _, err := range errs {
				if strings.Contains(err.Error(), c.want) {
					return
				}
			}
			t.Errorf("no error containing %q; got %v", c.want, errs)
		})
	}
}

func TestNeededLeavesOutPracticesAndGroupings(t *testing.T) {
	var codes []string
	for _, s := range Needed(smallGraph()) {
		codes = append(codes, s.GetCode())
	}
	if got := strings.Join(codes, " "); got != "4.NF.A.1 4.NF.A.1.a" {
		t.Errorf("Needed = %s, want 4.NF.A.1 4.NF.A.1.a", got)
	}
}

func TestTopicOfWalksUpToTheCluster(t *testing.T) {
	if got := TopicOf(smallGraph(), goodLayer(), "s1a").GetId(); got != "fractions" {
		t.Errorf("TopicOf(4.NF.A.1.a) = %q, want fractions", got)
	}
	if got := TopicOf(smallGraph(), goodLayer(), "mp"); got != nil {
		t.Errorf("TopicOf(4.MP1) = %v, want none", got)
	}
}
