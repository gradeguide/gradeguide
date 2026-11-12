package worksheets

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/bazelbuild/rules_go/go/runfiles"
	"google.golang.org/protobuf/encoding/prototext"
	"google.golang.org/protobuf/proto"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

func runfile(t *testing.T, env string) string {
	t.Helper()
	p, err := runfiles.Rlocation(os.Getenv(env))
	if err != nil {
		t.Fatalf("%s: %v", env, err)
	}
	return p
}

// TestCatalogue checks every alignment in content/worksheets against the
// graph, and that every placed fragment is aligned to a standard.
func TestCatalogue(t *testing.T) {
	b, err := os.ReadFile(runfile(t, "GRAPH"))
	if err != nil {
		t.Fatal(err)
	}
	g := &graphpb.Graph{}
	if err := proto.Unmarshal(b, g); err != nil {
		t.Fatal(err)
	}
	fsys := os.DirFS(filepath.Dir(runfile(t, "CATALOG")))
	lib, err := LoadLibrary(fsys)
	if err != nil {
		t.Fatal(err)
	}
	al, err := LoadAlignments(fsys)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range Check(g, lib, al) {
		t.Error(e)
	}

	// Every aligned component has a short name in data/step-names.textproto,
	// and every name there is for a component in the graph.
	b, err = os.ReadFile(runfile(t, "STEP_NAMES"))
	if err != nil {
		t.Fatal(err)
	}
	names := &graphpb.CuratedLayer{}
	if err := prototext.Unmarshal(b, names); err != nil {
		t.Fatal(err)
	}
	inGraph := map[string]bool{}
	for _, c := range g.GetComponents() {
		inGraph[c.GetId()] = true
	}
	named := map[string]bool{}
	for _, c := range names.GetComponents() {
		if !inGraph[c.GetComponentId()] || c.GetName() == "" || c.GetReview().GetStatus() == graphpb.Review_STATUS_UNSPECIFIED {
			t.Errorf("step name %s: not in the graph, or no name or review status", c.GetComponentId())
		}
		named[c.GetComponentId()] = true
	}
	for _, a := range al.GetAlignments() {
		if c := a.GetSkill().GetComponentId(); c != "" && !named[c] {
			t.Errorf("%s: step %s has no short name", a.GetFragmentId(), c)
		}
	}
}
