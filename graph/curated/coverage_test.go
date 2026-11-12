package curated

import (
	"os"
	"testing"

	"google.golang.org/protobuf/proto"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

// TestMathLayerCoversTheImport checks the checked-in math layer against the
// import of the pinned export: every entry resolves to an imported id with
// the same code, and every K-8 standard and cluster is covered.
func TestMathLayerCoversTheImport(t *testing.T) {
	data, err := os.ReadFile(runfile(t, "GRAPH"))
	if err != nil {
		t.Fatal(err)
	}
	g := &graphpb.Graph{}
	if err := proto.Unmarshal(data, g); err != nil {
		t.Fatal(err)
	}
	layer := mathLayer(t)
	for _, err := range Check(g, layer) {
		t.Error(err)
	}
	if got := len(Needed(g)); got < 300 {
		t.Errorf("the import has %d K-8 standards; want over 300, so the export or the filter has changed", got)
	}
	t.Logf("%d curated standards for %d needed; %d topics for %d clusters",
		len(layer.GetStandards()), len(Needed(g)), len(layer.GetTopics()), len(clusters(g)))
}
