package data

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/bazelbuild/rules_go/go/runfiles"
)

// TestWorksheetStepsAreSkillSteps checks the built math.json: every step a
// worksheet lists under a skill is one of that skill's steps, and every
// worksheet has a role.
func TestWorksheetStepsAreSkillSteps(t *testing.T) {
	path, err := runfiles.Rlocation(os.Getenv("MATH_JSON"))
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var d struct {
		Skills []struct {
			Code  string `json:"code"`
			Steps []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
				Text string `json:"text"`
			} `json:"steps"`
			Worksheets []struct {
				ID    string `json:"id"`
				Role  string `json:"role"`
				Steps []struct {
					StepID string `json:"stepId"`
					Where  string `json:"where"`
				} `json:"steps"`
			} `json:"worksheets"`
		} `json:"skills"`
	}
	if err := json.Unmarshal(b, &d); err != nil {
		t.Fatal(err)
	}
	listed := 0
	for _, sk := range d.Skills {
		steps := map[string]bool{}
		for _, st := range sk.Steps {
			if st.ID == "" || st.Name == "" || st.Text == "" {
				t.Errorf("%s: a step lacks an id, name or text: %+v", sk.Code, st)
			}
			steps[st.ID] = true
		}
		for _, w := range sk.Worksheets {
			switch w.Role {
			case "teaches", "practises", "checks", "reviews":
			default:
				t.Errorf("%s: %s has role %q", sk.Code, w.ID, w.Role)
			}
			for _, st := range w.Steps {
				listed++
				if !steps[st.StepID] {
					t.Errorf("%s: %s lists step %s, which is not one of the skill's steps", sk.Code, w.ID, st.StepID)
				}
				if st.Where == "" {
					t.Errorf("%s: %s lists step %s with no place", sk.Code, w.ID, st.StepID)
				}
			}
		}
	}
	if listed == 0 {
		t.Error("no worksheet lists any step")
	}
}
