package sitegen

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"
)

func fixture() *site {
	sk := func(id, code, grade, name string, month int32) skill {
		return skill{ID: id, Code: code, Grade: grade, Strand: "fractions-and-ratios", Name: name, Explanation: name + " explained.", Month: month,
			Statement: `Explain why $\frac{a}{b}$ works.`, Path: skillPath(grade, code, name)}
	}
	return &site{
		Version: "test",
		Grades:  []string{"3", "4"},
		Strands: []strand{{ID: "fractions-and-ratios", Name: "Fractions and ratios", Description: "Parts of a whole."}},
		Skills: []skill{
			sk("a", "3.NF.A.3", "3", "Simple equivalent fractions", 6),
			sk("b", "4.NF.A.1", "4", "Equivalent fractions", 1),
			sk("c", "4.NF.A.2", "4", `Comparing "fractions" <fast>`, 1),
		},
		Links: [][2]string{{"a", "b"}, {"b", "c"}},
	}
}

func TestSlugsAreReadableAndStable(t *testing.T) {
	if got, want := skillPath("4", "4.NF.A.1", "Equivalent fractions"), "/math/grade-4/4-nf-a-1-equivalent-fractions/"; got != want {
		t.Errorf("skillPath = %q, want %q", got, want)
	}
	if got, want := skillPath("K", "K.CC.A.1", `Counting to 100 by "ones"`), "/math/kindergarten/k-cc-a-1-counting-to-100-by-ones/"; got != want {
		t.Errorf("skillPath = %q, want %q", got, want)
	}
}

func TestPagesLinkOnlyToPagesThatExist(t *testing.T) {
	files, err := Pages(fixture(), "https://example.org")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"math/index.html", "math/grade-3/index.html", "math/grade-4/index.html", "math/topics/fractions-and-ratios/index.html", "math/grade-4/4-nf-a-1-equivalent-fractions/index.html", "sitemap.xml", "robots.txt"} {
		if files[want] == nil {
			t.Errorf("missing %s", want)
		}
	}
	// Files outside the generator that pages may link to.
	other := map[string]bool{"/": true, "/about.html": true, "/styles.css": true, "/pages.css": true}
	href := regexp.MustCompile(`href="(/[^"#]*)(#[^"]*)?"`)
	for name, data := range files {
		for _, m := range href.FindAllStringSubmatch(string(data), -1) {
			p := m[1]
			if m[2] != "" && p == "/" {
				continue // a link into the interactive map
			}
			if strings.HasPrefix(p, "/worksheets/") {
				continue // the worksheet gallery, built outside the generator
			}
			if !other[p] && files[strings.TrimPrefix(p, "/")+"index.html"] == nil {
				t.Errorf("%s links to %s, which is not generated", name, p)
			}
		}
	}
}

func TestSkillPageCarriesTextAndStructuredData(t *testing.T) {
	files, err := Pages(fixture(), "https://example.org")
	if err != nil {
		t.Fatal(err)
	}
	page := string(files["math/grade-4/4-nf-a-2-comparing-fractions-fast/index.html"])
	for _, want := range []string{
		`<link rel="canonical" href="https://example.org/math/grade-4/4-nf-a-2-comparing-fractions-fast/">`,
		"Comparing &#34;fractions&#34; &lt;fast&gt;",
		"Explain why a/b works.",
		`href="/math/grade-4/4-nf-a-1-equivalent-fractions/"`,
		`href="/#map/4/4.NF.A.2"`,
	} {
		if !strings.Contains(page, want) {
			t.Errorf("skill page lacks %q", want)
		}
	}
	m := regexp.MustCompile(`(?s)<script type="application/ld\+json">(.*?)</script>`).FindStringSubmatch(page)
	if m == nil {
		t.Fatal("no structured data")
	}
	var ld map[string]any
	if err := json.Unmarshal([]byte(m[1]), &ld); err != nil {
		t.Fatalf("structured data is not JSON: %v\n%s", err, m[1])
	}
	if a := ld["educationalAlignment"].(map[string]any); a["targetName"] != "4.NF.A.2" {
		t.Errorf("alignment = %v", a)
	}
}

func TestSitemapListsEveryPage(t *testing.T) {
	files, err := Pages(fixture(), "https://example.org")
	if err != nil {
		t.Fatal(err)
	}
	sm := string(files["sitemap.xml"])
	for name := range files {
		if !strings.HasSuffix(name, "index.html") {
			continue
		}
		loc := "https://example.org/" + strings.TrimSuffix(name, "index.html")
		if !strings.Contains(sm, "<loc>"+loc+"</loc>") {
			t.Errorf("sitemap lacks %s", loc)
		}
	}
}

func TestWorksheetsAreListedUnderTheSkillsTheyCover(t *testing.T) {
	s := fixture()
	s.Skills[1].Parts = []part{{Code: "4.NF.A.1.a", Name: "A part"}}
	s.Skills[1].Worksheets = []worksheetRef{
		{ID: "ws-one", Title: "One", Pages: 1, Href: "/worksheets/?answers=0&only=ws-one", Role: "teaches"},
		{ID: "ws-part", Title: "Part", Pages: 2, Href: "/worksheets/?answers=0&only=ws-part", Role: "practises"},
	}
	files, err := Pages(s, "https://example.org")
	if err != nil {
		t.Fatal(err)
	}
	page := string(files["math/grade-4/4-nf-a-1-equivalent-fractions/index.html"])
	if !strings.Contains(page, `href="/worksheets/?answers=0&amp;only=ws-part"`) || !strings.Contains(page, "2 pages") {
		t.Errorf("the skill page does not link to ws-part:\n%s", page)
	}
}
