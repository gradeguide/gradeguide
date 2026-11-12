package sitegen

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"regexp"
	"sort"
	"strings"
)

//go:embed templates/*.html
var templateFS embed.FS

var months = []string{"September", "October", "November", "December", "January", "February", "March", "April", "May", "June"}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

// slug turns "Word problems with \"times as many\"" into
// "word-problems-with-times-as-many".
func slug(s string) string {
	return strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(s), "-"), "-")
}

// gradeSlug is "kindergarten" for K and "grade-4" for 4.
func gradeSlug(g string) string {
	if g == "K" {
		return "kindergarten"
	}
	return "grade-" + g
}

func gradeName(g string) string {
	if g == "K" {
		return "Kindergarten"
	}
	return "Grade " + g
}

// skillPath is a skill page's address: the grade, then the code and plain
// name, which reads well in search results.
func skillPath(grade, code, name string) string {
	return "/math/" + gradeSlug(grade) + "/" + slug(code+" "+name) + "/"
}

func gradePath(g string) string       { return "/math/" + gradeSlug(g) + "/" }
func strandPath(id string) string     { return "/math/topics/" + id + "/" }
func mapLink(sk skill) string         { return "/#map/" + sk.Grade + "/" + sk.Code }
func foundationsLink(sk skill) string { return "/#path/" + sk.Grade + "/" + sk.Code + "/" + sk.Code }

// texMarkup matches the TeX in official wording.
var (
	texFrac  = regexp.MustCompile(`\\frac\{([^{}]*)\}\{([^{}]*)\}`)
	texOther = regexp.MustCompile(`\\[a-z]+`)
	spaces   = regexp.MustCompile(`\s+`)
)

// plainStatement turns the TeX in official wording into plain text, so
// \frac{a}{b} becomes a/b.
func plainStatement(s string) string {
	s = texFrac.ReplaceAllString(s, "$1/$2")
	for _, r := range [][2]string{{`\times`, "×"}, {`\div`, "÷"}, {`\le`, "≤"}, {`\ge`, "≥"}, {`\cdot`, "·"}, {`\pi`, "π"}, {"^2", "²"}, {"^{2}", "²"}, {"^3", "³"}, {"^{3}", "³"}} {
		s = strings.ReplaceAll(s, r[0], r[1])
	}
	s = texOther.ReplaceAllString(s, "")
	s = strings.NewReplacer("{", "", "}", "", "$", "").Replace(s)
	return strings.TrimSpace(spaces.ReplaceAllString(s, " "))
}

type crumb struct {
	Name string
	Path string
}

type link struct {
	Name  string
	Path  string
	Grade string
}

type monthGroup struct {
	Month  string
	Skills []link
}

type gradeGroup struct {
	Grade  string
	Path   string
	Skills []link
}

// page is what every template gets. Only the fields a template uses are set.
type page struct {
	Title       string
	Description string
	Path        string
	Canonical   string
	Crumbs      []crumb
	JSONLD      template.JS
	Body        string

	Skill       *skill
	StrandName  string
	TopicName   string
	When        string
	Before      []link
	After       []link
	Statement   string
	MapLink     string
	Foundations string

	Grade  string
	Months []monthGroup

	Strand      *strand
	ByGrade     []gradeGroup
	Grades      []gradeGroup
	Strands     []strand
	StrandPaths map[string]string
}

// Pages renders the site's static pages: one per skill, grade and strand, a
// home page for them, a sitemap and robots.txt. Keys are paths relative to
// the site root, such as "math/grade-4/index.html". baseURL is the site's
// address without a trailing slash, for canonical links and the sitemap.
func Pages(s *site, baseURL string) (map[string][]byte, error) {
	tmpl, err := template.New("").Funcs(template.FuncMap{"gradeName": gradeName}).ParseFS(templateFS, "templates/*.html")
	if err != nil {
		return nil, err
	}
	byID := map[string]skill{}
	for _, sk := range s.Skills {
		byID[sk.ID] = sk
	}
	before, after := map[string][]link{}, map[string][]link{}
	for _, l := range s.Links {
		from, to := byID[l[0]], byID[l[1]]
		after[from.ID] = append(after[from.ID], link{to.Name, to.Path, to.Grade})
		before[to.ID] = append(before[to.ID], link{from.Name, from.Path, from.Grade})
	}
	strands := map[string]strand{}
	strandPaths := map[string]string{}
	for _, st := range s.Strands {
		strands[st.ID] = st
		strandPaths[st.ID] = strandPath(st.ID)
	}
	topics := map[string]topic{}
	for _, t := range s.Topics {
		topics[t.ID] = t
	}
	units := map[string]unit{}
	for _, u := range s.Units {
		units[u.ID] = u
	}

	out := map[string][]byte{}
	var paths []string
	render := func(name string, p page) error {
		p.Canonical = baseURL + p.Path
		var b bytes.Buffer
		if err := tmpl.ExecuteTemplate(&b, name, p); err != nil {
			return fmt.Errorf("%s: %w", p.Path, err)
		}
		out[strings.TrimPrefix(p.Path, "/")+"index.html"] = b.Bytes()
		paths = append(paths, p.Path)
		return nil
	}
	home := crumb{"Math", "/math/"}

	for _, sk := range s.Skills {
		sk := sk
		st := strands[sk.Strand]
		when := gradeName(sk.Grade)
		if u, ok := units[sk.UnitID]; ok {
			when = fmt.Sprintf("%s, from %s · %s: %s", gradeName(sk.Grade), months[sk.Month-1], u.Ordinal, u.Name)
		}
		ld, err := jsonLD(map[string]any{
			"@context":             "https://schema.org",
			"@type":                "LearningResource",
			"name":                 sk.Name,
			"description":          sk.Explanation,
			"url":                  baseURL + sk.Path,
			"educationalLevel":     gradeName(sk.Grade),
			"learningResourceType": "Skill explanation",
			"inLanguage":           "en",
			"isAccessibleForFree":  true,
			"educationalAlignment": map[string]any{
				"@type":                "AlignmentObject",
				"alignmentType":        "teaches",
				"educationalFramework": "Common Core State Standards for Mathematics",
				"targetName":           sk.Code,
				"targetDescription":    plainStatement(sk.Statement),
			},
		})
		if err != nil {
			return nil, err
		}
		p := page{
			Title:       fmt.Sprintf("%s: %s math (%s)", sk.Name, strings.ToLower(gradeName(sk.Grade)), sk.Code),
			Description: sk.Explanation,
			Path:        sk.Path,
			Crumbs:      []crumb{home, {gradeName(sk.Grade), gradePath(sk.Grade)}, {st.Name, strandPath(st.ID)}},
			JSONLD:      ld,
			Skill:       &sk,
			StrandName:  st.Name,
			TopicName:   topics[sk.Topic].Name,
			When:        when,
			Before:      sortLinks(before[sk.ID]),
			After:       sortLinks(after[sk.ID]),
			Statement:   plainStatement(sk.Statement),
			MapLink:     mapLink(sk),
			Foundations: foundationsLink(sk),
			StrandPaths: strandPaths,
		}
		if err := render("skill.html", p); err != nil {
			return nil, err
		}
	}

	var gradeGroups []gradeGroup
	for _, g := range s.Grades {
		var ms []monthGroup
		var all []link
		for m := 1; m <= 10; m++ {
			var ls []link
			for _, sk := range s.Skills {
				if sk.Grade == g && int(sk.Month) == m {
					ls = append(ls, link{sk.Name, sk.Path, sk.Grade})
				}
			}
			if len(ls) > 0 {
				ms = append(ms, monthGroup{months[m-1], ls})
				all = append(all, ls...)
			}
		}
		gradeGroups = append(gradeGroups, gradeGroup{g, gradePath(g), all})
		p := page{
			Title:       fmt.Sprintf("%s math, month by month: every Common Core skill", gradeName(g)),
			Description: fmt.Sprintf("What a child learns in %s math each month, September to June, with a plain explanation of every skill.", strings.ToLower(gradeName(g))),
			Path:        gradePath(g),
			Crumbs:      []crumb{home},
			Grade:       g,
			Months:      ms,
		}
		if err := render("grade.html", p); err != nil {
			return nil, err
		}
	}

	for _, st := range s.Strands {
		st := st
		var groups []gradeGroup
		for _, g := range s.Grades {
			var ls []link
			for _, sk := range s.Skills {
				if sk.Grade == g && sk.Strand == st.ID {
					ls = append(ls, link{sk.Name, sk.Path, sk.Grade})
				}
			}
			if len(ls) > 0 {
				groups = append(groups, gradeGroup{g, gradePath(g), ls})
			}
		}
		p := page{
			Title:       fmt.Sprintf("%s in K–8 math, grade by grade", st.Name),
			Description: st.Description,
			Path:        strandPath(st.ID),
			Crumbs:      []crumb{home},
			Strand:      &st,
			ByGrade:     groups,
		}
		if err := render("strand.html", p); err != nil {
			return nil, err
		}
	}

	if err := render("home.html", page{
		Title:       "K–8 math, month by month: what your child learns",
		Description: "Every Common Core math skill from kindergarten to grade 8, when it is usually taught, what it builds on, and a plain explanation for parents.",
		Path:        "/math/",
		Grades:      gradeGroups,
		Strands:     s.Strands,
		StrandPaths: strandPaths,
	}); err != nil {
		return nil, err
	}

	sort.Strings(paths)
	var sm bytes.Buffer
	sm.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n" + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, p := range append([]string{"/", "/about.html"}, paths...) {
		fmt.Fprintf(&sm, "  <url><loc>%s%s</loc></url>\n", baseURL, p)
	}
	sm.WriteString("</urlset>\n")
	out["sitemap.xml"] = sm.Bytes()
	out["robots.txt"] = []byte("User-agent: *\nAllow: /\nSitemap: " + baseURL + "/sitemap.xml\n")
	return out, nil
}

func sortLinks(ls []link) []link {
	sort.SliceStable(ls, func(i, j int) bool {
		if ls[i].Grade != ls[j].Grade {
			return gradeIndex(ls[i].Grade) < gradeIndex(ls[j].Grade)
		}
		return ls[i].Name < ls[j].Name
	})
	return ls
}

// jsonLD encodes structured data for a <script type="application/ld+json">
// block. html/template would escape it as a string, so it is marked safe
// after encoding/json has escaped <, > and & within it.
func jsonLD(v any) (template.JS, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return template.JS(b), nil
}
