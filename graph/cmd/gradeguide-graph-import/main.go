// Command gradeguide-graph-import converts a Learning Commons Knowledge Graph
// export into a Grade Guide graph file.
//
//	gradeguide-graph-import --nodes nodes.jsonl \
//	  --relationships relationships.jsonl --version v1.17.0 --out graph.binpb
//
// An --out ending in .json is written as protobuf JSON; anything else is
// binary protobuf. With --curated, the curated layer in that directory is
// checked against the import, and the command fails on any problem after
// writing --out.
//
// The build runs this on the pinned export; see data/BUILD.bazel.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	"github.com/gradeguide/gradeguide/graph/curated"
	"github.com/gradeguide/gradeguide/graph/lcimport"
	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

type config struct {
	nodes, relationships, out, version, downloaded, subject string
	jurisdictions, grades, courses                          []string
	curatedDir                                              string
	quiet                                                   bool
}

func main() {
	var c config
	flag.StringVar(&c.nodes, "nodes", "", "the export's nodes.jsonl")
	flag.StringVar(&c.relationships, "relationships", "", "the export's relationships.jsonl")
	flag.StringVar(&c.out, "out", "", "output file; .json for protobuf JSON, otherwise binary")
	flag.StringVar(&c.version, "version", "", "the export's release, such as v1.17.0")
	flag.StringVar(&c.downloaded, "downloaded", "", "date the export was downloaded, YYYY-MM-DD, when it has no release")
	flag.StringVar(&c.subject, "subject", "Mathematics", "academic subject to keep")
	jurisdictions := flag.String("jurisdictions", "Multi-State", "comma-separated jurisdictions to keep; Common Core is Multi-State")
	grades := flag.String("grades", "K,1,2,3,4,5,6,7,8", "comma-separated grades to keep")
	courses := flag.String("courses", "im360:K,im360:1,im360:2,im360:3,im360:4,im360:5,im360:6,im360:7,im360:8", "comma-separated curriculum course codes to keep")
	flag.StringVar(&c.curatedDir, "curated", "", "directory of curated textproto files to check against the import")
	flag.BoolVar(&c.quiet, "quiet", false, "print nothing unless something fails")
	flag.Parse()
	c.jurisdictions, c.grades, c.courses = split(*jurisdictions), split(*grades), split(*courses)

	if c.nodes == "" || c.relationships == "" || c.out == "" || (c.version == "" && c.downloaded == "") {
		fmt.Fprintln(os.Stderr, "gradeguide-graph-import: --nodes, --relationships, --out, and --version or --downloaded are required")
		flag.Usage()
		os.Exit(2)
	}
	if err := run(c); err != nil {
		fmt.Fprintln(os.Stderr, "gradeguide-graph-import:", err)
		os.Exit(1)
	}
}

func run(c config) error {
	snap := &graphpb.Snapshot{
		Source:     "Learning Commons Knowledge Graph",
		Version:    c.version,
		Downloaded: c.downloaded,
		Sha256:     map[string]string{},
	}
	var readers []io.Reader
	for name, path := range map[string]string{"nodes.jsonl": c.nodes, "relationships.jsonl": c.relationships} {
		sum, err := fileSHA256(path)
		if err != nil {
			return err
		}
		snap.Sha256[name] = sum
	}
	for _, path := range []string{c.nodes, c.relationships} {
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		readers = append(readers, f)
	}

	g, err := lcimport.Import(readers[0], readers[1],
		lcimport.WithSubject(c.subject),
		lcimport.WithJurisdictions(c.jurisdictions...),
		lcimport.WithGrades(c.grades...),
		lcimport.WithCourses(c.courses...))
	if err != nil {
		return err
	}
	g.Snapshot = snap

	var data []byte
	if strings.HasSuffix(c.out, ".json") {
		data, err = protojson.MarshalOptions{Multiline: true}.Marshal(g)
	} else {
		data, err = proto.MarshalOptions{Deterministic: true}.Marshal(g)
	}
	if err != nil {
		return err
	}
	if err := os.WriteFile(c.out, data, 0o644); err != nil {
		return err
	}
	if !c.quiet {
		fmt.Printf("%d frameworks, %d standards, %d components, %d misconceptions, %d constructs, %d curriculum records, %d links, %d placements -> %s\n",
			len(g.GetFrameworks()), len(g.GetStandards()), len(g.GetComponents()), len(g.GetMisconceptions()),
			len(g.GetConstructs()), len(g.GetCurriculum()), len(g.GetLinks()), len(g.GetPlacements()), c.out)
	}

	if c.curatedDir == "" {
		return nil
	}
	layer, err := curated.Load(os.DirFS(c.curatedDir))
	if err != nil {
		return fmt.Errorf("curated layer: %w", err)
	}
	errs := curated.Check(g, layer)
	for _, e := range errs {
		fmt.Fprintln(os.Stderr, "curated:", e)
	}
	if len(errs) > 0 {
		return fmt.Errorf("%d problems in the curated layer", len(errs))
	}
	if !c.quiet {
		fmt.Printf("curated layer: %d standards, %d topics, %d components; no problems\n",
			len(layer.GetStandards()), len(layer.GetTopics()), len(layer.GetComponents()))
	}
	return nil
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func split(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
