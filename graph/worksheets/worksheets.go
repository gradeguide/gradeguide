// Package worksheets joins the worksheet catalogue to the skill graph. It
// loads the catalogue and its alignments, checks every alignment against the
// graph, and fills in the standard codes each fragment prints in a
// worksheet's header.
package worksheets

import (
	"errors"
	"fmt"
	"io/fs"
	"path"
	"sort"

	"google.golang.org/protobuf/encoding/prototext"
	"google.golang.org/protobuf/proto"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
	worksheetpb "github.com/gradeguide/gradeguide/worksheet/proto/v1"
)

// LoadLibrary reads every .textproto file at the top of fsys that holds
// Library fields and merges them, in file name order. Files whose name
// starts with "alignments" are skipped; LoadAlignments reads them.
func LoadLibrary(fsys fs.FS) (*worksheetpb.Library, error) {
	lib := &worksheetpb.Library{}
	err := each(fsys, false, func(name string, data []byte) error {
		part := &worksheetpb.Library{}
		if err := prototext.Unmarshal(data, part); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		proto.Merge(lib, part)
		return nil
	})
	return lib, err
}

// LoadAlignments reads every alignments*.textproto file at the top of fsys
// and merges them.
func LoadAlignments(fsys fs.FS) (*graphpb.WorksheetAlignments, error) {
	al := &graphpb.WorksheetAlignments{}
	err := each(fsys, true, func(name string, data []byte) error {
		part := &graphpb.WorksheetAlignments{}
		if err := prototext.Unmarshal(data, part); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		proto.Merge(al, part)
		return nil
	})
	return al, err
}

func each(fsys fs.FS, alignments bool, f func(name string, data []byte) error) error {
	names, err := fs.Glob(fsys, "*.textproto")
	if err != nil {
		return err
	}
	sort.Strings(names)
	found := false
	for _, name := range names {
		if isAlignments(name) != alignments {
			continue
		}
		found = true
		data, err := fs.ReadFile(fsys, name)
		if err != nil {
			return err
		}
		if err := f(path.Base(name), data); err != nil {
			return err
		}
	}
	if !found {
		return errors.New("no .textproto files")
	}
	return nil
}

func isAlignments(name string) bool {
	base := path.Base(name)
	return len(base) >= len("alignments") && base[:len("alignments")] == "alignments"
}

// Check returns every alignment g cannot resolve, and every fragment placed
// on a worksheet with no standard alignment. An alignment resolves when its
// fragment is in lib, it has a role, its standard code names a standard in
// g, or its component id names a component in g that supports a standard
// the same fragment is aligned to.
func Check(g *graphpb.Graph, lib *worksheetpb.Library, al *graphpb.WorksheetAlignments) []error {
	var errs []error
	bad := func(format string, args ...any) { errs = append(errs, fmt.Errorf(format, args...)) }

	fragments := map[string]bool{}
	for _, f := range lib.GetFragments() {
		fragments[f.GetId()] = true
	}
	byCode := map[string]*graphpb.Standard{}
	byID := map[string]*graphpb.Standard{}
	for _, s := range g.GetStandards() {
		byID[s.GetId()] = s
		if s.GetCode() != "" {
			byCode[s.GetCode()] = s
		}
	}
	components := map[string]bool{}
	for _, c := range g.GetComponents() {
		components[c.GetId()] = true
	}
	supports := map[string]map[string]bool{}
	for _, l := range g.GetLinks() {
		if l.GetKind() == graphpb.Link_KIND_SUPPORTS {
			if supports[l.GetFromId()] == nil {
				supports[l.GetFromId()] = map[string]bool{}
			}
			supports[l.GetFromId()][l.GetToId()] = true
		}
	}

	standardsOf := map[string][]string{}
	for _, a := range al.GetAlignments() {
		if s := standard(a.GetSkill(), byID, byCode); s != nil {
			standardsOf[a.GetFragmentId()] = append(standardsOf[a.GetFragmentId()], s.GetId())
		}
	}

	for _, a := range al.GetAlignments() {
		id := a.GetFragmentId()
		if !fragments[id] {
			bad("an alignment names fragment %q, which is not in the catalogue", id)
		}
		if a.GetRole() == graphpb.WorksheetAlignment_ROLE_UNSPECIFIED {
			bad("%s: an alignment has no role", id)
		}
		sk := a.GetSkill()
		switch {
		case sk.GetComponentId() != "":
			c := sk.GetComponentId()
			if !components[c] {
				bad("%s: component %s is not in the graph", id, c)
				continue
			}
			ok := false
			for _, std := range standardsOf[id] {
				ok = ok || supports[c][std]
			}
			if !ok {
				bad("%s: component %s supports none of the standards %s is aligned to", id, c, id)
			}
		case sk.GetStandardId() != "" || sk.GetCode() != "":
			s := standard(sk, byID, byCode)
			switch {
			case s == nil:
				bad("%s: standard %s%s is not in the graph", id, sk.GetCode(), sk.GetStandardId())
			case sk.GetCode() != "" && s.GetCode() != sk.GetCode():
				bad("%s: standard id %s is %s in the graph, not %s", id, sk.GetStandardId(), s.GetCode(), sk.GetCode())
			case s.GetKind() != graphpb.Standard_KIND_STANDARD:
				bad("%s: %s is a %v in the graph, not a standard", id, s.GetCode(), s.GetKind())
			}
		default:
			bad("%s: an alignment names no skill", id)
		}
	}

	seen := map[string]bool{}
	for _, w := range lib.GetWorksheets() {
		for _, p := range w.GetPlacements() {
			id := p.GetFragmentId()
			if len(standardsOf[id]) == 0 && !seen[id] {
				seen[id] = true
				bad("%s: placed on %s and aligned to no standard", id, w.GetId())
			}
		}
	}
	return errs
}

func standard(sk *graphpb.SkillRef, byID, byCode map[string]*graphpb.Standard) *graphpb.Standard {
	if id := sk.GetStandardId(); id != "" {
		return byID[id]
	}
	if sk.GetComponentId() != "" {
		return nil
	}
	return byCode[sk.GetCode()]
}

// FillHeaderLabels sets each fragment's header labels to the codes of the
// standards it is aligned to: what it teaches, practises or checks first,
// then what it reviews. The engine prints them in a worksheet's header.
func FillHeaderLabels(lib *worksheetpb.Library, al *graphpb.WorksheetAlignments) {
	main := map[string][]string{}
	review := map[string][]string{}
	for _, a := range al.GetAlignments() {
		code := a.GetSkill().GetCode()
		if code == "" || a.GetSkill().GetComponentId() != "" {
			continue
		}
		if a.GetRole() == graphpb.WorksheetAlignment_ROLE_REVIEWS {
			review[a.GetFragmentId()] = append(review[a.GetFragmentId()], code)
		} else {
			main[a.GetFragmentId()] = append(main[a.GetFragmentId()], code)
		}
	}
	for _, f := range lib.GetFragments() {
		seen := map[string]bool{}
		f.HeaderLabels = nil
		for _, c := range append(main[f.GetId()], review[f.GetId()]...) {
			if !seen[c] {
				seen[c] = true
				f.HeaderLabels = append(f.HeaderLabels, c)
			}
		}
	}
}
