// Command gradeguide-sitegen writes the data file the website reads.
//
//	gradeguide-sitegen --graph graph.binpb --curated content/math --out math.json \
//	  --pages pages --base-url https://gradeguide.github.io
//
// --pages, when set, is a directory to write the static pages into: one per
// skill, grade and topic, plus sitemap.xml and robots.txt.
//
// --worksheets and --composed, when set, are the worksheet catalogue and its
// composed sheets; each skill then lists the worksheets that cover it.
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
	"github.com/gradeguide/gradeguide/graph/worksheets"
	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
	"github.com/gradeguide/gradeguide/site/sitegen"
)

func main() {
	graphPath := flag.String("graph", "", "skill graph, binary protobuf")
	curatedDir := flag.String("curated", "", "directory of curated .textproto files")
	out := flag.String("out", "", "output JSON file")
	pages := flag.String("pages", "", "directory to write the static pages into")
	worksheetsDir := flag.String("worksheets", "", "the worksheet catalogue directory")
	composedDir := flag.String("composed", "", "the composed worksheets directory, one JSON ComposedSheet per worksheet")
	baseURL := flag.String("base-url", "https://gradeguide.github.io", "the site's address, for canonical links and the sitemap")
	flag.Parse()
	if *graphPath == "" || *curatedDir == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "gradeguide-sitegen: --graph, --curated and --out are required")
		os.Exit(2)
	}
	if err := run(*graphPath, *curatedDir, *worksheetsDir, *composedDir, *out, *pages, strings.TrimSuffix(*baseURL, "/")); err != nil {
		fmt.Fprintln(os.Stderr, "gradeguide-sitegen:", err)
		os.Exit(1)
	}
}

func run(graphPath, curatedDir, worksheetsDir, composedDir, out, pagesDir, baseURL string) error {
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
	if worksheetsDir != "" {
		sheets, err := loadSheets(worksheetsDir, composedDir)
		if err != nil {
			return err
		}
		sitegen.AttachWorksheets(s, sheets)
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

// loadSheets reads the worksheet catalogue for the standards each worksheet
// covers, and its composed sheets for how many pages each has.
func loadSheets(catalogDir, composedDir string) ([]sitegen.Sheet, error) {
	fsys := os.DirFS(catalogDir)
	lib, err := worksheets.LoadLibrary(fsys)
	if err != nil {
		return nil, err
	}
	al, err := worksheets.LoadAlignments(fsys)
	if err != nil {
		return nil, err
	}
	codes := map[string][]string{}
	for _, a := range al.GetAlignments() {
		if c := a.GetSkill().GetCode(); c != "" && a.GetRole() != graphpb.WorksheetAlignment_ROLE_REVIEWS {
			codes[a.GetFragmentId()] = append(codes[a.GetFragmentId()], c)
		}
	}
	var sheets []sitegen.Sheet
	for _, w := range lib.GetWorksheets() {
		data, err := os.ReadFile(filepath.Join(composedDir, w.GetId()+".json"))
		if err != nil {
			return nil, err
		}
		var composed struct {
			Pages []json.RawMessage `json:"pages"`
		}
		if err := json.Unmarshal(data, &composed); err != nil {
			return nil, fmt.Errorf("%s: %w", w.GetId(), err)
		}
		sh := sitegen.Sheet{ID: w.GetId(), Title: w.GetTitle(), Minutes: w.GetMinutes(), Pages: len(composed.Pages)}
		for _, p := range w.GetPlacements() {
			sh.Codes = append(sh.Codes, codes[p.GetFragmentId()]...)
		}
		sheets = append(sheets, sh)
	}
	return sheets, nil
}
