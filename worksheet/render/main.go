// render-worksheets writes every worksheet in a gallery as print files: a PDF
// to print, a PDF with the answers filled in, and a PNG of page one.
//
//	render-worksheets --gallery <dir> --out <dir>
//
// --gallery is a directory worksheet_library builds: index.html, gallery.js,
// library.binpb and fonts/. The pages are served on loopback to the hermetic
// Chromium in //worksheet/chromium, which prints them, so a sheet's PDF is
// what the page prints in any browser.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
	"google.golang.org/protobuf/proto"

	"github.com/gradeguide/gradeguide/worksheet/chromium"
	worksheetpb "github.com/gradeguide/gradeguide/worksheet/proto/v1"
)

// thumbnailWidth is the width of a page-one PNG in pixels. A page is 816 CSS
// pixels wide.
const thumbnailWidth = 240

func main() {
	gallery := flag.String("gallery", "", "the gallery directory")
	out := flag.String("out", "", "the directory to write the files into")
	flag.Parse()
	if *gallery == "" || *out == "" {
		log.Fatal("--gallery and --out are both required")
	}
	if err := run(*gallery, *out); err != nil {
		log.Fatal(err)
	}
}

func run(gallery, out string) error {
	b, err := os.ReadFile(filepath.Join(gallery, "library.binpb"))
	if err != nil {
		return err
	}
	lib := &worksheetpb.Library{}
	if err := proto.Unmarshal(b, lib); err != nil {
		return err
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		return err
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	srv := &http.Server{Handler: http.FileServer(http.Dir(gallery))}
	go srv.Serve(ln)
	defer srv.Close()
	base := "http://" + ln.Addr().String() + "/"

	opts, err := chromium.ExecAllocatorOptions()
	if err != nil {
		return err
	}
	// Chromium's sandbox needs unprivileged user namespaces, which some
	// build machines block (Ubuntu 24.04 does, through AppArmor), and then
	// Chromium will not start. The browser only loads this repository's own
	// pages from a loopback server, so it runs without the sandbox.
	opts = append(opts, chromedp.NoSandbox, chromedp.Flag("disable-setuid-sandbox", true))
	actx, cancel := chromedp.NewExecAllocator(context.Background(), append(chromedp.DefaultExecAllocatorOptions[:], opts...)...)
	defer cancel()
	ctx, cancel := chromedp.NewContext(actx)
	defer cancel()
	// Start the browser on ctx itself. The first Run starts it under the
	// context it is given, so starting it under a call's timeout would close
	// the browser when that call returns.
	if err := chromedp.Run(ctx); err != nil {
		return err
	}

	for _, ws := range lib.GetWorksheets() {
		id := ws.GetId()
		for _, f := range []struct {
			query, file string
		}{
			{"answers=0", id + ".pdf"},
			{"answers=only", id + "-answers.pdf"},
		} {
			pdf, err := printPDF(ctx, base+"?"+f.query+"&only="+id)
			if err != nil {
				return fmt.Errorf("%s: %w", f.file, err)
			}
			if err := os.WriteFile(filepath.Join(out, f.file), pdf, 0o644); err != nil {
				return err
			}
		}
		png, err := thumbnail(ctx, base+"?answers=0&only="+id)
		if err != nil {
			return fmt.Errorf("%s.png: %w", id, err)
		}
		if err := os.WriteFile(filepath.Join(out, id+".png"), png, 0o644); err != nil {
			return err
		}
	}
	return nil
}

// load opens a sheet and waits until it is drawn and its fonts are loaded.
func load(url string) chromedp.Tasks {
	return chromedp.Tasks{
		chromedp.Navigate(url),
		chromedp.WaitVisible("ws-sheet .page", chromedp.ByQuery),
		chromedp.Evaluate(`document.fonts.ready.then(() => true)`, nil, func(p *runtime.EvaluateParams) *runtime.EvaluateParams { return p.WithAwaitPromise(true) }),
	}
}

func printPDF(ctx context.Context, url string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	var pdf []byte
	err := chromedp.Run(ctx, load(url), chromedp.ActionFunc(func(ctx context.Context) error {
		var err error
		pdf, _, err = page.PrintToPDF().WithPreferCSSPageSize(true).WithPrintBackground(true).Do(ctx)
		return err
	}))
	return pdf, err
}

func thumbnail(ctx context.Context, url string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	var png []byte
	err := chromedp.Run(ctx,
		emulation.SetDeviceMetricsOverride(900, 1200, float64(thumbnailWidth)/816, false),
		load(url),
		chromedp.Screenshot("ws-sheet .page", &png, chromedp.ByQuery),
		emulation.ClearDeviceMetricsOverride(),
	)
	return png, err
}
