// Command gradeguide-sitegen writes the data file the website reads.
//
//	gradeguide-sitegen --graph graph.binpb --curated content/math --out math.json \
//	  --pages pages --base-url https://gradeguide.github.io
//
// --pages, when set, is a directory to write the static pages into: one per
// skill, grade and topic, plus sitemap.xml and robots.txt.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"google.golang.org/protobuf/proto"

	"github.com/gradeguide/gradeguide/graph/curated"
	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
	"github.com/gradeguide/gradeguide/site/sitegen"
)

func main() {
	graphPath := flag.String("graph", "", "skill graph, binary protobuf")
	curatedDir := flag.String("curated", "", "directory of curated .textproto files")
	out := flag.String("out", "", "output JSON file")
	pages := flag.String("pages", "", "directory to write the static pages into")
	baseURL := flag.String("base-url", "https://gradeguide.github.io", "the site's address, for canonical links and the sitemap")
	flag.Parse()
	if *graphPath == "" || *curatedDir == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "gradeguide-sitegen: --graph, --curated and --out are required")
		os.Exit(2)
	}
	if err := run(*graphPath, *curatedDir, *out, *pages, strings.TrimSuffix(*baseURL, "/")); err != nil {
		fmt.Fprintln(os.Stderr, "gradeguide-sitegen:", err)
		os.Exit(1)
	}
}

func run(graphPath, curatedDir, out, pagesDir, baseURL string) error {
	data, err := os.ReadFile(graphPath)
	if err != nil {
		return err
	}
	g := &graphpb.Graph{}
	if err := proto.Unmarshal(data, g); err != nil {
		return err
	}
	c, err := curated.Load(os.DirFS(curatedDir))
	if err != nil {
		return err
	}
	s, err := sitegen.Build(g, c)
	if err != nil {
		return err
	}
	b, err := json.Marshal(s)
	if err != nil {
		return err
	}
	if err := os.WriteFile(out, b, 0o644); err != nil {
		return err
	}
	if pagesDir == "" {
		return nil
	}
	files, err := sitegen.Pages(s, baseURL)
	if err != nil {
		return err
	}
	for name, data := range files {
		path := filepath.Join(pagesDir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(path, data, 0o644); err != nil {
			return err
		}
	}
	return nil
}
