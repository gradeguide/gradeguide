package curated

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/bazelbuild/rules_go/go/runfiles"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

// runfile returns the path of the runfile whose rlocation path the
// environment variable env holds. BUILD.bazel sets these variables.
func runfile(t *testing.T, env string) string {
	t.Helper()
	p, err := runfiles.Rlocation(os.Getenv(env))
	if err != nil {
		t.Fatalf("%s: %v", env, err)
	}
	return p
}

// mathLayer loads the checked-in math layer from content/math.
func mathLayer(t *testing.T) *graphpb.CuratedLayer {
	t.Helper()
	layer, err := Load(os.DirFS(filepath.Dir(runfile(t, "MATH_STRANDS"))))
	if err != nil {
		t.Fatal(err)
	}
	return layer
}
