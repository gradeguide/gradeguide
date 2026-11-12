// Package lcimport converts a download of the Learning Commons Knowledge
// Graph into a Grade Guide graph.
//
// The download is two JSON-lines files. Each line of nodes.jsonl is one record
// with a type label and a map of string properties. Each line of
// relationships.jsonl is one typed link between two records, by identifier.
// Import keeps the frameworks and standards that match its filter, the
// learning components that support them, the curriculum courses it is asked
// for, and the misconceptions for the same subject, and drops everything else.
//
// It also derives what the explorer needs and the source does not state
// directly: each standard's strand, each lesson's place in its course, when
// each unit and lesson is taught, and which unit mainly teaches each
// standard. See derive.go.
package lcimport

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"

	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

// Option narrows what Import keeps.
type Option func(*options)

type options struct {
	subject       string
	jurisdictions map[string]bool
	grades        map[string]bool
	courses       map[string]bool
}

// WithSubject keeps standards, components and misconceptions for one subject,
// such as "Mathematics". The default is "Mathematics".
func WithSubject(subject string) Option {
	return func(o *options) { o.subject = subject }
}

// WithJurisdictions keeps frameworks from these jurisdictions only. Common
// Core is "Multi-State". The default is "Multi-State".
func WithJurisdictions(j ...string) Option {
	return func(o *options) { o.jurisdictions = set(j) }
}

// WithGrades keeps standards that apply to at least one of these grades,
// written "PK", "K", "1" to "12". The default is every grade.
func WithGrades(g ...string) Option {
	return func(o *options) { o.grades = set(g) }
}

// WithCourses keeps the curriculum courses with these course codes, such as
// "im360:4". The default is none.
func WithCourses(c ...string) Option {
	return func(o *options) { o.courses = set(c) }
}

func set(items []string) map[string]bool {
	m := make(map[string]bool, len(items))
	for _, s := range items {
		m[s] = true
	}
	return m
}

type node struct {
	Identifier string            `json:"identifier"`
	Labels     []string          `json:"labels"`
	Properties map[string]string `json:"properties"`
}

type relationship struct {
	Label      string            `json:"label"`
	Source     string            `json:"source_identifier"`
	Target     string            `json:"target_identifier"`
	Properties map[string]string `json:"properties"`
}

// Import reads nodes.jsonl and relationships.jsonl and returns the filtered
// graph, sorted by id. It does not set Graph.snapshot.
func Import(nodes, relationships io.Reader, opts ...Option) (*graphpb.Graph, error) {
	o := options{subject: "Mathematics", jurisdictions: set([]string{"Multi-State"})}
	for _, opt := range opts {
		opt(&o)
	}

	// Candidates are every record that might be kept. Components, mastery
	// statistics and misconceptions are only kept once the links show what
	// they attach to.
	cand := map[string]*node{}
	err := eachLine(nodes, func(line []byte) error {
		var n node
		if err := json.Unmarshal(line, &n); err != nil {
			return err
		}
		if len(n.Labels) == 0 {
			return nil
		}
		if o.candidate(&n) {
			cand[n.Identifier] = &n
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("reading nodes: %w", err)
	}

	var rels []relationship
	err = eachLine(relationships, func(line []byte) error {
		var r relationship
		if err := json.Unmarshal(line, &r); err != nil {
			return err
		}
		if cand[r.Source] != nil && cand[r.Target] != nil {
			rels = append(rels, r)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("reading relationships: %w", err)
	}
	return build(cand, rels), nil
}

func (o *options) candidate(n *node) bool {
	p := n.Properties
	switch n.Labels[0] {
	case "StandardsFramework":
		return p["academicSubject"] == o.subject && o.jurisdictions[p["jurisdiction"]]
	case "StandardsFrameworkItem":
		return p["academicSubject"] == o.subject && o.jurisdictions[p["jurisdiction"]] && o.gradeMatch(p["gradeLevel"])
	case "LearningComponent", "Misconception", "Construct":
		return p["academicSubject"] == o.subject
	case "MasteryThreshold":
		return true
	case "Course", "LessonGrouping", "Lesson", "Activity", "Assessment":
		return o.courses[p["courseCode"]]
	}
	return false
}

func (o *options) gradeMatch(raw string) bool {
	if len(o.grades) == 0 {
		return true
	}
	for _, g := range grades(raw) {
		if o.grades[g] {
			return true
		}
	}
	return false
}

func build(cand map[string]*node, rels []relationship) *graphpb.Graph {
	label := func(id string) string { return cand[id].Labels[0] }

	// Containment becomes parent fields, and mastery statistics are folded
	// into the record they describe.
	parent := map[string]string{}
	mastery := map[string]string{}
	supported := map[string]bool{}
	for _, r := range rels {
		switch r.Label {
		case "hasChild", "hasPart":
			parent[r.Target] = r.Source
		case "hasMasteryThreshold":
			mastery[r.Source] = r.Target
		case "supports":
			if label(r.Source) == "LearningComponent" && label(r.Target) == "StandardsFrameworkItem" {
				supported[r.Source] = true
			}
		}
	}
	frameworkOf := func(id string) string {
		for i := 0; i < 64 && id != ""; i++ {
			if label(id) == "StandardsFramework" {
				return id
			}
			id = parent[id]
		}
		return ""
	}

	g := &graphpb.Graph{}
	kept := map[string]bool{}
	for id, n := range cand {
		p := n.Properties
		switch n.Labels[0] {
		case "StandardsFramework":
			g.Frameworks = append(g.Frameworks, &graphpb.Framework{
				Id: id, Name: p["name"], Jurisdiction: p["jurisdiction"], Subject: p["academicSubject"],
				Currency: currency(p["isCurrent"]), SourceIds: sourceIDs(n), Attribution: attribution(p),
			})
		case "StandardsFrameworkItem":
			fw := frameworkOf(id)
			if fw == "" {
				continue
			}
			par := parent[id]
			if par == fw {
				par = ""
			}
			g.Standards = append(g.Standards, &graphpb.Standard{
				Id: id, FrameworkId: fw, Code: p["statementCode"], Description: p["description"],
				Kind: standardKind(p["normalizedStatementType"]), StatementType: p["statementType"],
				Grades: grades(p["gradeLevel"]), ParentId: par, Position: atoi(p["position"]),
				Adoption: adoption(p["adoptionStatus"]), Mastery: masteryStats(cand[mastery[id]]),
				SourceIds: sourceIDs(n), Attribution: attribution(p),
			})
		case "LearningComponent":
			if !supported[id] {
				continue
			}
			g.Components = append(g.Components, &graphpb.Component{
				Id: id, Description: p["description"], Examples: stringList(p["examples"]),
				Subject: p["academicSubject"], Mastery: masteryStats(cand[mastery[id]]),
				SourceIds: sourceIDs(n), Attribution: attribution(p),
			})
		case "Misconception":
			g.Misconceptions = append(g.Misconceptions, &graphpb.Misconception{
				Id: id, Description: p["description"], SourceIds: sourceIDs(n), Attribution: attribution(p),
			})
		case "Construct":
			g.Constructs = append(g.Constructs, &graphpb.Construct{
				Id: id, Description: p["description"], SourceIds: sourceIDs(n), Attribution: attribution(p),
			})
		case "Course", "LessonGrouping", "Lesson", "Activity", "Assessment":
			g.Curriculum = append(g.Curriculum, &graphpb.CurriculumNode{
				Id: id, CourseCode: p["courseCode"], Level: level(n), Name: p["name"],
				OrdinalName: p["ordinalName"], Label: p["curriculumLabel"], Position: atoi(p["position"]),
				ParentId: parent[id], Grades: grades(p["gradeLevel"]), TimeRequired: p["timeRequired"],
				Optionality: optionality(p["isOptional"]), SourceIds: sourceIDs(n), Attribution: attribution(p),
			})
		default:
			continue
		}
		kept[id] = true
	}

	for _, r := range rels {
		kind, ok := linkKinds[r.Label]
		if !ok || !kept[r.Source] || !kept[r.Target] {
			continue
		}
		l := &graphpb.Link{FromId: r.Source, ToId: r.Target, Kind: kind, Attribution: attribution(r.Properties)}
		switch kind {
		case graphpb.Link_KIND_ALIGNED_TO:
			l.Alignment = alignments[r.Properties["curriculumAlignmentType"]]
		case graphpb.Link_KIND_MATCHES_STANDARD:
			l.Jaccard, _ = strconv.ParseFloat(r.Properties["jaccard"], 64)
		case graphpb.Link_KIND_REFERENCES:
			l.ReferenceType = r.Properties["curriculumReferenceType"]
		}
		g.Links = append(g.Links, l)
	}

	derive(g)
	sortByID(g)
	return g
}

var linkKinds = map[string]graphpb.Link_Kind{
	"supports":                graphpb.Link_KIND_SUPPORTS,
	"buildsTowards":           graphpb.Link_KIND_BUILDS_TOWARDS,
	"relatesTo":               graphpb.Link_KIND_RELATES_TO,
	"hasStandardAlignment":    graphpb.Link_KIND_MATCHES_STANDARD,
	"hasEducationalAlignment": graphpb.Link_KIND_ALIGNED_TO,
	"hasDependency":           graphpb.Link_KIND_DEPENDS_ON,
	"hasReference":            graphpb.Link_KIND_REFERENCES,
	"mutuallyExclusiveWith":   graphpb.Link_KIND_ALTERNATIVE_TO,
	"hinders":                 graphpb.Link_KIND_HINDERS,
}

var alignments = map[string]graphpb.Link_Alignment{
	"addressing":      graphpb.Link_ALIGNMENT_ADDRESSING,
	"building_on":     graphpb.Link_ALIGNMENT_BUILDING_ON,
	"building_toward": graphpb.Link_ALIGNMENT_BUILDING_TOWARD,
	"practicing":      graphpb.Link_ALIGNMENT_PRACTISING,
}

func sortByID(g *graphpb.Graph) {
	sort.Slice(g.Frameworks, func(i, j int) bool { return g.Frameworks[i].Id < g.Frameworks[j].Id })
	sort.Slice(g.Standards, func(i, j int) bool { return g.Standards[i].Id < g.Standards[j].Id })
	sort.Slice(g.Components, func(i, j int) bool { return g.Components[i].Id < g.Components[j].Id })
	sort.Slice(g.Misconceptions, func(i, j int) bool { return g.Misconceptions[i].Id < g.Misconceptions[j].Id })
	sort.Slice(g.Constructs, func(i, j int) bool { return g.Constructs[i].Id < g.Constructs[j].Id })
	sort.Slice(g.Curriculum, func(i, j int) bool { return g.Curriculum[i].Id < g.Curriculum[j].Id })
	sort.Slice(g.Links, func(i, j int) bool {
		a, b := g.Links[i], g.Links[j]
		if a.FromId != b.FromId {
			return a.FromId < b.FromId
		}
		if a.ToId != b.ToId {
			return a.ToId < b.ToId
		}
		return a.Kind < b.Kind
	})
}

func sourceIDs(n *node) *graphpb.SourceIds {
	p := n.Properties
	return &graphpb.SourceIds{
		LearningCommons: n.Identifier, CaseUuid: p["caseIdentifierUUID"],
		CaseUri: p["caseIdentifierURI"], Publisher: p["publisherIdentifier"],
	}
}

func attribution(p map[string]string) *graphpb.Attribution {
	return &graphpb.Attribution{Author: p["author"], Statement: p["attributionStatement"], LicenseUrl: p["license"]}
}

func masteryStats(n *node) *graphpb.MasteryStats {
	if n == nil {
		return nil
	}
	p := n.Properties
	f := func(k string) float64 { v, _ := strconv.ParseFloat(p[k], 64); return v }
	return &graphpb.MasteryStats{
		AlignedItemCount: atoi(p["alignedItemCount"]),
		Threshold_50:     f("masteryThreshold50"), Threshold_67: f("masteryThreshold67"),
		Reliability_50: f("reliability50"), Reliability_67: f("reliability67"),
		Attribution: attribution(p),
	}
}

func level(n *node) graphpb.CurriculumNode_Level {
	switch n.Labels[0] {
	case "Course":
		return graphpb.CurriculumNode_LEVEL_COURSE
	case "Lesson":
		return graphpb.CurriculumNode_LEVEL_LESSON
	case "Activity":
		return graphpb.CurriculumNode_LEVEL_ACTIVITY
	case "Assessment":
		return graphpb.CurriculumNode_LEVEL_ASSESSMENT
	}
	switch n.Properties["groupName"] {
	case "unit":
		return graphpb.CurriculumNode_LEVEL_UNIT
	case "section":
		return graphpb.CurriculumNode_LEVEL_SECTION
	}
	return graphpb.CurriculumNode_LEVEL_UNKNOWN
}

func optionality(v string) graphpb.CurriculumNode_Optionality {
	switch v {
	case "true":
		return graphpb.CurriculumNode_OPTIONALITY_OPTIONAL
	case "false":
		return graphpb.CurriculumNode_OPTIONALITY_REQUIRED
	}
	return graphpb.CurriculumNode_OPTIONALITY_UNKNOWN
}

func currency(v string) graphpb.Framework_Currency {
	switch v {
	case "true":
		return graphpb.Framework_CURRENCY_CURRENT
	case "false":
		return graphpb.Framework_CURRENCY_SUPERSEDED
	}
	return graphpb.Framework_CURRENCY_UNKNOWN
}

func standardKind(v string) graphpb.Standard_Kind {
	switch v {
	case "Standard":
		return graphpb.Standard_KIND_STANDARD
	case "Standard Grouping":
		return graphpb.Standard_KIND_GROUPING
	case "Other":
		return graphpb.Standard_KIND_OTHER
	}
	return graphpb.Standard_KIND_UNKNOWN
}

func adoption(v string) graphpb.Standard_Adoption {
	switch v {
	case "Adopted":
		return graphpb.Standard_ADOPTION_ADOPTED
	case "Pending Implementation":
		return graphpb.Standard_ADOPTION_PENDING
	case "Draft":
		return graphpb.Standard_ADOPTION_DRAFT
	case "Retired":
		return graphpb.Standard_ADOPTION_RETIRED
	}
	return graphpb.Standard_ADOPTION_UNKNOWN
}

// grades parses a gradeLevel property, which is a JSON array in a string,
// such as `["3","4","5"]`.
func grades(raw string) []string {
	return stringList(raw)
}

func stringList(raw string) []string {
	if raw == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []string{raw}
	}
	return out
}

func atoi(s string) int32 {
	v, _ := strconv.Atoi(strings.TrimSpace(s))
	return int32(v)
}

func eachLine(r io.Reader, fn func([]byte) error) error {
	s := bufio.NewScanner(r)
	s.Buffer(make([]byte, 1<<20), 64<<20)
	for n := 1; s.Scan(); n++ {
		if len(strings.TrimSpace(s.Text())) == 0 {
			continue
		}
		if err := fn(s.Bytes()); err != nil {
			return fmt.Errorf("line %d: %w", n, err)
		}
	}
	return s.Err()
}
