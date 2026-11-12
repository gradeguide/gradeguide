// Package sitegen turns the skill graph and the curated layer into the data
// file the website reads. The file holds only what the pages show: K–8
// Common Core math standards with their parent-facing text, when each is
// taught, the prerequisite links between them, and the credits the source
// licence requires.
package sitegen

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/gradeguide/gradeguide/graph/curated"
	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
)

// Grades lists the grades the site covers, in order.
var Grades = []string{"K", "1", "2", "3", "4", "5", "6", "7", "8"}

// maxComponents caps the smaller steps listed under one skill.
const maxComponents = 8

type site struct {
	Version string      `json:"version"`
	Grades  []string    `json:"grades"`
	Strands []strand    `json:"strands"`
	Topics  []topic     `json:"topics"`
	Units   []unit      `json:"units"`
	Skills  []skill     `json:"skills"`
	Links   [][2]string `json:"links"`
	Credits []credit    `json:"credits"`
}

type strand struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type topic struct {
	ID     string `json:"id"`
	Strand string `json:"strand"`
	Name   string `json:"name"`
}

type unit struct {
	ID         string `json:"id"`
	Grade      string `json:"grade"`
	Ordinal    string `json:"ordinal"`
	Name       string `json:"name"`
	StartMonth int32  `json:"startMonth"`
	EndMonth   int32  `json:"endMonth"`
}

type part struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type also struct {
	UnitID string `json:"unitId"`
	Month  int32  `json:"month"`
}

type skill struct {
	ID          string         `json:"id"`
	Code        string         `json:"code"`
	Grade       string         `json:"grade"`
	Strand      string         `json:"strand"`
	Topic       string         `json:"topic,omitempty"`
	Name        string         `json:"name"`
	Explanation string         `json:"explanation"`
	Example     string         `json:"example"`
	TryAtHome   string         `json:"tryAtHome"`
	Draft       bool           `json:"draft"`
	Statement   string         `json:"statement"`
	UnitID      string         `json:"unitId,omitempty"`
	Month       int32          `json:"month"`
	Also        []also         `json:"also,omitempty"`
	Parts       []part         `json:"parts,omitempty"`
	Steps       []step         `json:"steps,omitempty"`
	Worksheets  []worksheetRef `json:"worksheets,omitempty"`
	// Path is the skill's own page, such as
	// "/math/grade-4/4-nf-a-1-equivalent-fractions/".
	Path string `json:"path"`
}

// step is one of a skill's smaller steps: a learning component that
// supports it.
type step struct {
	// The component's id.
	ID string `json:"id"`
	// The short name, or the description when the step has none.
	Name string `json:"name"`
	// The full description.
	Text string `json:"text"`
}

// worksheetRef is a printable worksheet listed under a skill.
type worksheetRef struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Minutes int32  `json:"minutes,omitempty"`
	Pages   int    `json:"pages"`
	// The worksheet's page, from the site's root.
	Href string `json:"href"`
	// The worksheet's page, opened with the answers shown.
	AnswersHref string `json:"answersHref"`
	// What the sheet does for this skill: "teaches", "practises", "checks"
	// or "reviews", the first of these any of its parts does.
	Role string `json:"role"`
	// The skill's steps the sheet practises, and where.
	Steps []worksheetStep `json:"steps,omitempty"`
	// The print files, from the site's root, when they were built: the
	// sheet as a PDF, the sheet with its answers as a PDF, and page one as a
	// PNG about 240 pixels wide.
	PDF        string `json:"pdf,omitempty"`
	AnswersPDF string `json:"answersPdf,omitempty"`
	Thumbnail  string `json:"thumbnail,omitempty"`
}

// worksheetStep is one of a skill's steps that a part of a worksheet
// practises.
type worksheetStep struct {
	StepID string `json:"stepId"`
	// Such as "Part B, problems 5–8".
	Where string `json:"where"`
}

// Role is what a part of a worksheet does for a standard, strongest first.
// A sheet's role for a skill is the strongest of its parts' roles.
type Role int

const (
	RoleTeaches Role = iota + 1
	RolePractises
	RoleChecks
	RoleReviews
)

var roleNames = map[Role]string{RoleTeaches: "teaches", RolePractises: "practises", RoleChecks: "checks", RoleReviews: "reviews"}

// Sheet is a worksheet in the catalogue, as Build needs it.
type Sheet struct {
	ID      string
	Title   string
	Minutes int32
	Pages   int
	Parts   []SheetPart
	// Whether <id>.pdf, <id>-answers.pdf and <id>.png were built.
	Printed bool
}

// SheetPart is one section of a worksheet: one placed fragment.
type SheetPart struct {
	// Such as "Part B, problems 5–8".
	Where string
	// The standards, or lettered parts, the fragment is aligned to.
	Standards []Aligned
	// The learning components the fragment is aligned to.
	Components []string
}

// Aligned is a standard code and what a part does for it.
type Aligned struct {
	Code string
	Role Role
}

// worksheetsFor lists the sheets with a part aligned to sk or to one of its
// lettered parts, with the steps of sk each practises: sheets that only
// review sk last, otherwise in the order given. canonical maps a component
// to the step that stands for it.
func worksheetsFor(sk skill, sheets []Sheet, canonical map[string]string) []worksheetRef {
	codes := map[string]bool{sk.Code: true}
	for _, p := range sk.Parts {
		codes[p.Code] = true
	}
	mine := map[string]bool{}
	for _, st := range sk.Steps {
		mine[st.ID] = true
	}
	var main, reviews []worksheetRef
	for _, sh := range sheets {
		var role Role
		var steps []worksheetStep
		for _, p := range sh.Parts {
			for _, a := range p.Standards {
				if codes[a.Code] && (role == 0 || a.Role < role) {
					role = a.Role
				}
			}
			for _, comp := range p.Components {
				if id := canonical[comp]; mine[id] {
					steps = append(steps, worksheetStep{id, p.Where})
				}
			}
		}
		if role == 0 {
			continue
		}
		ref := worksheetRef{ID: sh.ID, Title: sh.Title, Minutes: sh.Minutes, Pages: sh.Pages, Href: "/worksheets/?only=" + sh.ID, AnswersHref: "/worksheets/?only=" + sh.ID + "&answers=1", Role: roleNames[role], Steps: steps}
		if sh.Printed {
			ref.PDF = "/worksheets/" + sh.ID + ".pdf"
			ref.AnswersPDF = "/worksheets/" + sh.ID + "-answers.pdf"
			ref.Thumbnail = "/worksheets/" + sh.ID + ".png"
		}
		if role == RoleReviews {
			reviews = append(reviews, ref)
		} else {
			main = append(main, ref)
		}
	}
	return append(main, reviews...)
}

type credit struct {
	Author    string `json:"author"`
	Statement string `json:"statement"`
	License   string `json:"license"`
}

// limitNote matches the bracketed limits Learning Commons repeats on
// otherwise identical component descriptions, such as "(denominators
// limited to 2, 3, 4, 5, 6, 8, 10, 12, and 100)".
var limitNote = regexp.MustCompile(`\s*\([^)]*limited[^)]*\)`)

// Build returns the site data for g and its curated layer c. A standard
// without curated text is left out; the import's own check already fails the
// build when a K–8 standard has none.
func Build(g *graphpb.Graph, c *graphpb.CuratedLayer, sheets []Sheet) (*site, error) {
	out := &site{Version: g.GetSnapshot().GetVersion(), Grades: Grades}
	creditSet := map[credit]bool{}
	addCredit := func(a *graphpb.Attribution) {
		if a.GetAuthor() == "" {
			return
		}
		creditSet[credit{a.GetAuthor(), a.GetStatement(), a.GetLicenseUrl()}] = true
	}

	for _, s := range c.GetStrands() {
		if s.GetStrand() == graphpb.Strand_STRAND_PRACTICES {
			continue
		}
		out.Strands = append(out.Strands, strand{strandID(s.GetStrand()), s.GetName(), s.GetDescription()})
	}
	for _, t := range c.GetTopics() {
		out.Topics = append(out.Topics, topic{t.GetId(), strandID(t.GetStrand()), t.GetName()})
	}

	text := map[string]*graphpb.CuratedStandard{}
	for _, s := range c.GetStandards() {
		text[s.GetStandardId()] = s
	}
	byID := map[string]*graphpb.Standard{}
	for _, s := range g.GetStandards() {
		byID[s.GetId()] = s
	}
	grade := map[string]bool{}
	for _, gr := range Grades {
		grade[gr] = true
	}
	shown := func(s *graphpb.Standard) bool {
		return s.GetKind() == graphpb.Standard_KIND_STANDARD &&
			s.GetStrand() != graphpb.Strand_STRAND_PRACTICES &&
			len(s.GetGrades()) == 1 && grade[s.GetGrades()[0]] &&
			text[s.GetId()] != nil
	}
	// top maps a shown standard, or a lettered part of one, to the shown
	// standard a card stands for.
	top := map[string]string{}
	for _, s := range g.GetStandards() {
		if !shown(s) {
			continue
		}
		if p := byID[s.GetParentId()]; p != nil && p.GetKind() == graphpb.Standard_KIND_STANDARD {
			continue
		}
		top[s.GetId()] = s.GetId()
	}
	parts := map[string][]part{}
	for _, s := range g.GetStandards() {
		if !shown(s) {
			continue
		}
		if p := byID[s.GetParentId()]; p != nil && top[p.GetId()] == p.GetId() {
			top[s.GetId()] = p.GetId()
			parts[p.GetId()] = append(parts[p.GetId()], part{s.GetCode(), text[s.GetId()].GetName()})
		}
	}

	units := map[string]*graphpb.CurriculumNode{}
	for _, n := range g.GetCurriculum() {
		if n.GetLevel() == graphpb.CurriculumNode_LEVEL_UNIT {
			units[n.GetId()] = n
		}
	}
	usedUnits := map[string]bool{}
	main := map[string]*graphpb.Placement{}
	alsoIn := map[string][]also{}
	for _, p := range g.GetPlacements() {
		id := p.GetStandardId()
		if top[id] != id || units[p.GetUnitId()] == nil {
			continue
		}
		switch p.GetRole() {
		case graphpb.Placement_ROLE_MAIN:
			main[id] = p
		case graphpb.Placement_ROLE_ALSO:
			alsoIn[id] = append(alsoIn[id], also{p.GetUnitId(), int32(p.GetPace().GetStartMonth())})
		}
		usedUnits[p.GetUnitId()] = true
	}

	components := map[string]*graphpb.Component{}
	for _, comp := range g.GetComponents() {
		components[comp.GetId()] = comp
	}
	names := map[string]string{}
	for _, cc := range c.GetComponents() {
		names[cc.GetComponentId()] = cc.GetName()
	}
	// Each shown skill's candidate steps, in link order, one per distinct
	// description. canonical maps every supporting component to the
	// candidate with its description.
	candidates := map[string][]step{}
	canonical := map[string]string{}
	edges := map[[2]string]bool{}
	for _, l := range g.GetLinks() {
		switch l.GetKind() {
		case graphpb.Link_KIND_SUPPORTS:
			to := top[l.GetToId()]
			comp := components[l.GetFromId()]
			if to == "" || comp == nil {
				continue
			}
			d := strings.TrimSpace(limitNote.ReplaceAllString(comp.GetDescription(), ""))
			if d == "" {
				continue
			}
			found := ""
			for _, st := range candidates[to] {
				if st.Text == d {
					found = st.ID
				}
			}
			if found == "" {
				found = comp.GetId()
				candidates[to] = append(candidates[to], step{ID: found, Text: d})
			}
			if names[found] == "" {
				names[found] = names[comp.GetId()]
			}
			canonical[comp.GetId()] = found
		case graphpb.Link_KIND_BUILDS_TOWARDS:
			from, to := top[l.GetFromId()], top[l.GetToId()]
			if from == "" || to == "" || from == to || edges[[2]string{from, to}] {
				continue
			}
			edges[[2]string{from, to}] = true
			out.Links = append(out.Links, [2]string{from, to})
			addCredit(l.GetAttribution())
		}
	}

	// A skill keeps every step a worksheet practises, then the others in
	// link order up to maxComponents.
	used := map[string]bool{}
	for _, sh := range sheets {
		for _, p := range sh.Parts {
			for _, comp := range p.Components {
				if id := canonical[comp]; id != "" {
					used[id] = true
				}
			}
		}
	}
	steps := map[string][]step{}
	for to, cs := range candidates {
		room := maxComponents
		for _, st := range cs {
			if used[st.ID] {
				room--
			}
		}
		for _, st := range cs {
			if !used[st.ID] {
				if room <= 0 {
					continue
				}
				room--
			}
			st.Name = names[st.ID]
			if st.Name == "" {
				st.Name = st.Text
			}
			steps[to] = append(steps[to], st)
			addCredit(components[st.ID].GetAttribution())
		}
	}

	for id := range top {
		if top[id] != id {
			continue
		}
		s := byID[id]
		t := text[id]
		sk := skill{
			Path:        skillPath(s.GetGrades()[0], s.GetCode(), t.GetName()),
			ID:          id,
			Code:        s.GetCode(),
			Grade:       s.GetGrades()[0],
			Strand:      strandID(s.GetStrand()),
			Name:        t.GetName(),
			Explanation: t.GetExplanation(),
			Example:     t.GetExample(),
			TryAtHome:   t.GetTryAtHome(),
			Draft:       t.GetReview().GetStatus() != graphpb.Review_STATUS_REVIEWED,
			Statement:   s.GetDescription(),
			Also:        alsoIn[id],
			Parts:       parts[id],
			Steps:       steps[id],
		}
		if tp := curated.TopicOf(g, c, id); tp != nil {
			sk.Topic = tp.GetId()
		}
		if p := main[id]; p != nil {
			sk.UnitID = p.GetUnitId()
			sk.Month = int32(p.GetPace().GetStartMonth())
		}
		sort.Slice(sk.Also, func(i, j int) bool { return sk.Also[i].UnitID < sk.Also[j].UnitID })
		addCredit(s.GetAttribution())
		sk.Worksheets = worksheetsFor(sk, sheets, canonical)
		out.Skills = append(out.Skills, sk)
	}
	if len(out.Skills) == 0 {
		return nil, fmt.Errorf("no K-8 standards with curated text")
	}

	for id := range usedUnits {
		n := units[id]
		_, gr, _ := strings.Cut(n.GetCourseCode(), ":")
		out.Units = append(out.Units, unit{
			ID:         id,
			Grade:      gr,
			Ordinal:    n.GetOrdinalName(),
			Name:       strings.TrimSpace(n.GetName()),
			StartMonth: int32(n.GetPace().GetStartMonth()),
			EndMonth:   int32(n.GetPace().GetEndMonth()),
		})
		addCredit(n.GetAttribution())
	}

	sort.Slice(out.Skills, func(i, j int) bool { return codeLess(out.Skills[i].Code, out.Skills[j].Code) })
	sort.Slice(out.Units, func(i, j int) bool {
		a, b := out.Units[i], out.Units[j]
		if a.Grade != b.Grade {
			return gradeIndex(a.Grade) < gradeIndex(b.Grade)
		}
		return units[a.ID].GetPosition() < units[b.ID].GetPosition()
	})
	sort.Slice(out.Links, func(i, j int) bool {
		if out.Links[i][0] != out.Links[j][0] {
			return out.Links[i][0] < out.Links[j][0]
		}
		return out.Links[i][1] < out.Links[j][1]
	})
	for cr := range creditSet {
		out.Credits = append(out.Credits, cr)
	}
	sort.Slice(out.Credits, func(i, j int) bool {
		if out.Credits[i].Author != out.Credits[j].Author {
			return out.Credits[i].Author < out.Credits[j].Author
		}
		return out.Credits[i].Statement < out.Credits[j].Statement
	})
	return out, nil
}

// strandID turns STRAND_FRACTIONS_AND_RATIOS into "fractions-and-ratios".
func strandID(s graphpb.Strand) string {
	return strings.ReplaceAll(strings.ToLower(strings.TrimPrefix(s.String(), "STRAND_")), "_", "-")
}

func gradeIndex(g string) int {
	for i, x := range Grades {
		if x == g {
			return i
		}
	}
	return len(Grades)
}

// codeLess orders codes such as "4.NF.A.1" by grade first, then as text with
// numbers compared by value, so 4.NF.A.2 comes before 4.NF.A.10.
func codeLess(a, b string) bool {
	ga, gb := gradeIndex(strings.SplitN(a, ".", 2)[0]), gradeIndex(strings.SplitN(b, ".", 2)[0])
	if ga != gb {
		return ga < gb
	}
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) && i < len(pb); i++ {
		if pa[i] == pb[i] {
			continue
		}
		var na, nb int
		if _, err := fmt.Sscanf(pa[i], "%d", &na); err == nil {
			if _, err := fmt.Sscanf(pb[i], "%d", &nb); err == nil {
				return na < nb
			}
		}
		return pa[i] < pb[i]
	}
	return len(pa) < len(pb)
}
