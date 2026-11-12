// Command gradeguide-sitegen writes the data file the website reads.
//
//	gradeguide-sitegen --graph graph.binpb --curated content/math --out math.json
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"google.golang.org/protobuf/proto"

	"github.com/gradeguide/gradeguide/graph/curated"
	graphpb "github.com/gradeguide/gradeguide/proto/graph/v1"
	"github.com/gradeguide/gradeguide/site/sitegen"
)

func main() {
	graphPath := flag.String("graph", "", "skill graph, binary protobuf")
	curatedDir := flag.String("curated", "", "directory of curated .textproto files")
	out := flag.String("out", "", "output JSON file")
	flag.Parse()
	if *graphPath == "" || *curatedDir == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "gradeguide-sitegen: --graph, --curated and --out are required")
		os.Exit(2)
	}
	if err := run(*graphPath, *curatedDir, *out); err != nil {
		fmt.Fprintln(os.Stderr, "gradeguide-sitegen:", err)
		os.Exit(1)
	}
}

func run(graphPath, curatedDir, out string) error {
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
	return os.WriteFile(out, b, 0o644)
}
