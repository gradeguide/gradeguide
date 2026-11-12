// gradeguide-worksheet-library encodes a worksheet catalogue directory as a
// binary worksheet Library, with each fragment's header labels filled in from
// the catalogue's alignments.
//
//	gradeguide-worksheet-library --catalog=content/worksheets --out=library.binpb
package main

import (
	"flag"
	"log"
	"os"

	"google.golang.org/protobuf/proto"

	"github.com/gradeguide/gradeguide/graph/worksheets"
)

func main() {
	catalog := flag.String("catalog", "", "the catalogue directory: Library and alignments textproto files")
	out := flag.String("out", "", "where to write the binary Library")
	flag.Parse()
	if *catalog == "" || *out == "" {
		log.Fatal("--catalog and --out are both required")
	}
	fsys := os.DirFS(*catalog)
	lib, err := worksheets.LoadLibrary(fsys)
	if err != nil {
		log.Fatal(err)
	}
	al, err := worksheets.LoadAlignments(fsys)
	if err != nil {
		log.Fatal(err)
	}
	worksheets.FillHeaderLabels(lib, al)
	b, err := proto.MarshalOptions{Deterministic: true}.Marshal(lib)
	if err != nil {
		log.Fatal(err)
	}
	if err := os.WriteFile(*out, b, 0o644); err != nil {
		log.Fatal(err)
	}
}
