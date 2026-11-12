// Package curated loads and checks the curated layer: the hand-written,
// parent-facing text kept beside an imported skill graph.
//
// The layer is a directory of textproto files, each a CuratedLayer. Load
// merges them. CheckLayer checks the layer on its own; Check also checks it
// against an imported graph.
package curated

import (
	"errors"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"

	"google.golang.org/protobuf/encoding/prototext"
	"google.golang.org/protobuf/proto"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

// Load reads every .textproto file at the top of fsys and merges them into
// one layer, in file name order.
func Load(fsys fs.FS) (*graphpb.CuratedLayer, error) {
	names, err := fs.Glob(fsys, "*.textproto")
	if err != nil {
		return nil, err
	}
	if len(names) == 0 {
		return nil, errors.New("no .textproto files")
	}
	sort.Strings(names)
	layer := &graphpb.CuratedLayer{}
	for _, name := range names {
		data, err := fs.ReadFile(fsys, name)
		if err != nil {
			return nil, err
		}
		part := &graphpb.CuratedLayer{}
		if err := prototext.Unmarshal(data, part); err != nil {
			return nil, fmt.Errorf("%s: %w", path.Base(name), err)
		}
		proto.Merge(layer, part)
	}
	return layer, nil
}

// CheckLayer returns every problem in the layer that can be found without
// the graph: missing text, a missing review status, duplicates, and topics
// that overlap.
func CheckLayer(c *graphpb.CuratedLayer) []error {
	var errs []error
	bad := func(format string, args ...any) { errs = append(errs, fmt.Errorf(format, args...)) }
	review := func(what string, r *graphpb.Review) {
		switch r.GetStatus() {
		case graphpb.Review_STATUS_UNSPECIFIED:
			bad("%s: no review status", what)
		case graphpb.Review_STATUS_DRAFT:
		default:
			if r.GetReviewer() == "" || r.GetReviewed() == "" {
				bad("%s: status %v needs a reviewer and a date", what, r.GetStatus())
			}
		}
	}

	strands := map[graphpb.Strand]bool{}
	for _, s := range c.GetStrands() {
		what := fmt.Sprintf("strand %v", s.GetStrand())
		if s.GetStrand() == graphpb.Strand_STRAND_UNSPECIFIED {
			bad("a strand entry has no strand")
		}
		if strands[s.GetStrand()] {
			bad("%s: listed twice", what)
		}
		strands[s.GetStrand()] = true
		if s.GetName() == "" || s.GetDescription() == "" {
			bad("%s: needs a name and a description", what)
		}
		review(what, s.GetReview())
	}
	for v := range graphpb.Strand_name {
		if st := graphpb.Strand(v); st != graphpb.Strand_STRAND_UNSPECIFIED && !strands[st] {
			bad("strand %v: no entry", st)
		}
	}

	topics := map[string]bool{}
	clusters := map[string]string{}
	for _, t := range c.GetTopics() {
		what := fmt.Sprintf("topic %q", t.GetId())
		if t.GetId() == "" {
			bad("a topic has no id")
		}
		if topics[t.GetId()] {
			bad("%s: listed twice", what)
		}
		topics[t.GetId()] = true
		if t.GetStrand() == graphpb.Strand_STRAND_UNSPECIFIED || t.GetName() == "" || len(t.GetClusterCodes()) == 0 {
			bad("%s: needs a strand, a name and at least one cluster", what)
		}
		for _, code := range t.GetClusterCodes() {
			if other, ok := clusters[code]; ok {
				bad("%s: cluster %s is already in topic %q", what, code, other)
			}
			clusters[code] = t.GetId()
		}
		review(what, t.GetReview())
	}

	standards := map[string]bool{}
	codes := map[string]bool{}
	for _, s := range c.GetStandards() {
		what := fmt.Sprintf("standard %s", s.GetCode())
		if s.GetStandardId() == "" || s.GetCode() == "" {
			bad("standard %q (%s): needs both an id and a code", s.GetCode(), s.GetStandardId())
		}
		if standards[s.GetStandardId()] || codes[s.GetCode()] {
			bad("%s: listed twice", what)
		}
		standards[s.GetStandardId()], codes[s.GetCode()] = true, true
		for field, v := range map[string]string{
			"name": s.GetName(), "explanation": s.GetExplanation(), "example": s.GetExample(), "try_at_home": s.GetTryAtHome(),
		} {
			if strings.TrimSpace(v) == "" {
				bad("%s: no %s", what, field)
			}
		}
		review(what, s.GetReview())
	}

	components := map[string]bool{}
	for _, comp := range c.GetComponents() {
		what := fmt.Sprintf("component %s", comp.GetComponentId())
		if comp.GetComponentId() == "" || components[comp.GetComponentId()] {
			bad("%s: no id, or listed twice", what)
		}
		components[comp.GetComponentId()] = true
		if strings.TrimSpace(comp.GetName()) == "" {
			bad("%s: no name", what)
		}
		review(what, comp.GetReview())
	}
	return errs
}

// Needed returns the standards in g that must have a CuratedStandard: every
// standard and lettered part outside the Standards for Mathematical
// Practice.
func Needed(g *graphpb.Graph) []*graphpb.Standard {
	var out []*graphpb.Standard
	for _, s := range g.GetStandards() {
		if s.GetKind() == graphpb.Standard_KIND_STANDARD && s.GetStrand() != graphpb.Strand_STRAND_PRACTICES {
			out = append(out, s)
		}
	}
	return out
}

// clusters returns the cluster headings in g that must be in a topic.
func clusters(g *graphpb.Graph) []*graphpb.Standard {
	var out []*graphpb.Standard
	for _, s := range g.GetStandards() {
		if s.GetKind() == graphpb.Standard_KIND_GROUPING && s.GetStatementType() == "Cluster" &&
			s.GetStrand() != graphpb.Strand_STRAND_PRACTICES {
			out = append(out, s)
		}
	}
	return out
}

// Check returns every problem CheckLayer finds, plus every mismatch between
// the layer and g: an entry naming an id g does not have, a code that does
// not match, a standard from Needed with no entry, a cluster in no topic, or
// a topic whose strand differs from its clusters'.
func Check(g *graphpb.Graph, c *graphpb.CuratedLayer) []error {
	errs := CheckLayer(c)
	bad := func(format string, args ...any) { errs = append(errs, fmt.Errorf(format, args...)) }

	byID := map[string]*graphpb.Standard{}
	byCode := map[string]*graphpb.Standard{}
	for _, s := range g.GetStandards() {
		byID[s.GetId()] = s
		if s.GetCode() != "" {
			byCode[s.GetCode()] = s
		}
	}

	written := map[string]bool{}
	for _, cs := range c.GetStandards() {
		s := byID[cs.GetStandardId()]
		switch {
		case s == nil:
			bad("standard %s: id %s is not in the graph", cs.GetCode(), cs.GetStandardId())
		case s.GetCode() != cs.GetCode():
			bad("standard %s: id %s is %s in the graph", cs.GetCode(), cs.GetStandardId(), s.GetCode())
		case s.GetKind() != graphpb.Standard_KIND_STANDARD:
			bad("standard %s: is a %v in the graph, not a standard", cs.GetCode(), s.GetKind())
		}
		written[cs.GetStandardId()] = true
	}
	var missing []string
	for _, s := range Needed(g) {
		if !written[s.GetId()] {
			missing = append(missing, s.GetCode())
		}
	}
	sort.Strings(missing)
	for _, code := range missing {
		bad("standard %s: no curated entry", code)
	}

	inTopic := map[string]bool{}
	for _, t := range c.GetTopics() {
		for _, code := range t.GetClusterCodes() {
			inTopic[code] = true
			s := byCode[code]
			switch {
			case s == nil:
				bad("topic %q: cluster %s is not in the graph", t.GetId(), code)
			case s.GetStatementType() != "Cluster":
				bad("topic %q: %s is a %q, not a cluster", t.GetId(), code, s.GetStatementType())
			case s.GetStrand() != t.GetStrand():
				bad("topic %q: cluster %s is in strand %v, not %v", t.GetId(), code, s.GetStrand(), t.GetStrand())
			}
		}
	}
	for _, s := range clusters(g) {
		if !inTopic[s.GetCode()] {
			bad("cluster %s: in no topic", s.GetCode())
		}
	}

	components := map[string]bool{}
	for _, comp := range g.GetComponents() {
		components[comp.GetId()] = true
	}
	for _, comp := range c.GetComponents() {
		if !components[comp.GetComponentId()] {
			bad("component %s: not in the graph", comp.GetComponentId())
		}
	}
	return errs
}

// TopicOf returns the topic a standard belongs to: the topic holding the
// standard's cluster. A standard's cluster is the nearest ancestor that is a
// cluster heading. It returns nil if there is none.
func TopicOf(g *graphpb.Graph, c *graphpb.CuratedLayer, standardID string) *graphpb.Topic {
	byID := map[string]*graphpb.Standard{}
	for _, s := range g.GetStandards() {
		byID[s.GetId()] = s
	}
	byCluster := map[string]*graphpb.Topic{}
	for _, t := range c.GetTopics() {
		for _, code := range t.GetClusterCodes() {
			byCluster[code] = t
		}
	}
	for s, i := byID[standardID], 0; s != nil && i < 16; s, i = byID[s.GetParentId()], i+1 {
		if s.GetStatementType() == "Cluster" {
			return byCluster[s.GetCode()]
		}
	}
	return nil
}
