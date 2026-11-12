// Command gradeguide-sitegen writes the data file the website reads.
//
//	gradeguide-sitegen --graph graph.binpb --curated content/math --out math.json \
//	  --pages pages --base-url https://gradeguide.github.io
//
// --pages, when set, is a directory to write the static pages into: one per
// skill, grade and topic, plus sitemap.xml and robots.txt.
//
// --worksheets and --composed, when set, are the worksheet catalogue and its
// composed sheets; each skill then lists the worksheets that cover it, and
// which of its steps each practises where. --step-names is a curated layer
// of short names for steps.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"google.golang.org/protobuf/encoding/prototext"
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
	stepNames := flag.String("step-names", "", "a textproto CuratedLayer of short names for steps")
	baseURL := flag.String("base-url", "https://gradeguide.github.io", "the site's address, for canonical links and the sitemap")
	flag.Parse()
	if *graphPath == "" || *curatedDir == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "gradeguide-sitegen: --graph, --curated and --out are required")
		os.Exit(2)
	}
	if err := run(*graphPath, *curatedDir, *worksheetsDir, *composedDir, *stepNames, *out, *pages, strings.TrimSuffix(*baseURL, "/")); err != nil {
		fmt.Fprintln(os.Stderr, "gradeguide-sitegen:", err)
		os.Exit(1)
	}
}

func run(graphPath, curatedDir, worksheetsDir, composedDir, stepNames, out, pagesDir, baseURL string) error {
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
	if stepNames != "" {
		b, err := os.ReadFile(stepNames)
		if err != nil {
			return err
		}
		names := &graphpb.CuratedLayer{}
		if err := prototext.Unmarshal(b, names); err != nil {
			return fmt.Errorf("%s: %w", stepNames, err)
		}
		proto.Merge(c, names)
	}
	var sheets []sitegen.Sheet
	if worksheetsDir != "" {
		if sheets, err = loadSheets(worksheetsDir, composedDir); err != nil {
			return err
		}
	}
	s, err := sitegen.Build(g, c, sheets)
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

// loadSheets reads the worksheet catalogue for what each fragment is
// aligned to, and the composed sheets for page counts and for where each
// fragment's problems are.
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
	roles := map[graphpb.WorksheetAlignment_Role]sitegen.Role{
		graphpb.WorksheetAlignment_ROLE_TEACHES:   sitegen.RoleTeaches,
		graphpb.WorksheetAlignment_ROLE_PRACTISES: sitegen.RolePractises,
		graphpb.WorksheetAlignment_ROLE_CHECKS:    sitegen.RoleChecks,
		graphpb.WorksheetAlignment_ROLE_REVIEWS:   sitegen.RoleReviews,
	}
	standards := map[string][]sitegen.Aligned{}
	components := map[string][]string{}
	for _, a := range al.GetAlignments() {
		f := a.GetFragmentId()
		if c := a.GetSkill().GetComponentId(); c != "" {
			components[f] = append(components[f], c)
		} else if code := a.GetSkill().GetCode(); code != "" {
			standards[f] = append(standards[f], sitegen.Aligned{Code: code, Role: roles[a.GetRole()]})
		}
	}
	var sheets []sitegen.Sheet
	for _, w := range lib.GetWorksheets() {
		data, err := os.ReadFile(filepath.Join(composedDir, w.GetId()+".json"))
		if err != nil {
			return nil, err
		}
		var composed struct {
			Pages []struct {
				Sections []struct {
					Label      string `json:"label"`
					FragmentID string `json:"fragmentId"`
					Stage      string `json:"stage"`
					Continued  bool   `json:"continued"`
					Items      []struct {
						Label string `json:"label"`
					} `json:"items"`
				} `json:"sections"`
			} `json:"pages"`
		}
		if err := json.Unmarshal(data, &composed); err != nil {
			return nil, fmt.Errorf("%s: %w", w.GetId(), err)
		}
		sh := sitegen.Sheet{ID: w.GetId(), Title: w.GetTitle(), Minutes: w.GetMinutes(), Pages: len(composed.Pages)}
		// One part per section. A section continued onto the next page adds
		// its items to the part it continues.
		type section struct {
			label, fragment string
			review          bool
			items           []string
		}
		var secs []section
		for _, pg := range composed.Pages {
			for _, sec := range pg.Sections {
				var items []string
				for _, it := range sec.Items {
					items = append(items, it.Label)
				}
				if sec.Continued && len(secs) > 0 {
					secs[len(secs)-1].items = append(secs[len(secs)-1].items, items...)
					continue
				}
				secs = append(secs, section{sec.Label, sec.FragmentID, sec.Stage == "STAGE_REVIEW", items})
			}
		}
		for _, sec := range secs {
			// A section placed as review reviews every standard its
			// fragment covers, whatever the fragment does elsewhere.
			aligned := standards[sec.fragment]
			if sec.review {
				aligned = nil
				for _, a := range standards[sec.fragment] {
					aligned = append(aligned, sitegen.Aligned{Code: a.Code, Role: sitegen.RoleReviews})
				}
			}
			sh.Parts = append(sh.Parts, sitegen.SheetPart{
				Where:      where(sec.label, sec.items),
				Standards:  aligned,
				Components: components[sec.fragment],
			})
		}
		sheets = append(sheets, sh)
	}
	return sheets, nil
}

// where says where a section's problems are, such as "Part B, problems
// 5–8" or "Part 2, problem 2a".
func where(label string, items []string) string {
	switch len(items) {
	case 0:
		return "Part " + label
	case 1:
		return fmt.Sprintf("Part %s, problem %s", label, items[0])
	}
	return fmt.Sprintf("Part %s, problems %s–%s", label, items[0], items[len(items)-1])
}
