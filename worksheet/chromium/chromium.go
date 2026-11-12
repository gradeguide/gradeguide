// Package chromium says how to start the Chromium that build actions and tests
// drive: where its executable is, and which shared libraries it loads.
//
// rules_playwright fetches a Chromium build but none of the libraries it links
// against, such as NSS, ATK, CUPS and the X11 extensions. Without them in the
// build, Chromium loads them from the machine running the action, and fails on
// a machine that does not have them installed:
//
//	chrome: error while loading shared libraries: libnss3.so: cannot open shared object file
//
// :libraries holds those libraries, unpacked from Debian packages pinned in
// //MODULE.bazel. [ExecAllocatorOptions] points
// LD_LIBRARY_PATH at them, and keeps the GPU process's Vulkan loader from
// loading drivers installed on the host. The only libraries Chromium takes
// from the host are glibc's.
package chromium

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/bazelbuild/rules_go/go/runfiles"
	"github.com/chromedp/chromedp"
)

// The runfiles of the browser and the libraries, set by the BUILD file.
var browserRlocation, librariesRlocation string

// ExecAllocatorOptions returns the chromedp options that start the hermetic
// Chromium: the path to its executable, and an environment that makes it load
// its shared libraries from the build rather than the host.
//
// Pass them to [chromedp.NewExecAllocator] after
// [chromedp.DefaultExecAllocatorOptions].
//
// LD_LIBRARY_PATH replaces any value the caller's environment has, so no
// directory on the host is searched before the hermetic one. chromedp appends
// these variables after os.Environ, and os/exec keeps the last value of a
// repeated variable.
//
// It returns an error when either runfile cannot be resolved, or when the
// browser directory holds no Chromium executable.
func ExecAllocatorOptions() ([]chromedp.ExecAllocatorOption, error) {
	binary, err := binaryPath()
	if err != nil {
		return nil, err
	}
	libraries, err := librariesPath()
	if err != nil {
		return nil, err
	}
	env, err := environment(binary, libraries)
	if err != nil {
		return nil, err
	}
	return []chromedp.ExecAllocatorOption{
		chromedp.ExecPath(binary),
		chromedp.Env(env...),
	}, nil
}

// environment returns the variables that keep Chromium's dynamic loading
// inside the build.
//
// LD_LIBRARY_PATH covers the libraries the binary links and the ones it opens
// with dlopen. The Vulkan loader in the GPU process needs its own settings: it
// reads driver and layer manifests from /usr/share/vulkan and /etc/vulkan, and
// on a machine with Mesa installed it loads Mesa's drivers, and LLVM with them.
// VK_DRIVER_FILES (VK_ICD_FILENAMES in older loaders) limits it to the
// SwiftShader driver Playwright ships beside the binary, and
// VK_LOADER_LAYERS_DISABLE turns off the layers a host installs.
func environment(binary, libraries string) ([]string, error) {
	env := []string{
		"LD_LIBRARY_PATH=" + libraries,
		// A directory with no drivers in it. libva otherwise loads the
		// host's video drivers, and the host's Mesa with them.
		"LIBVA_DRIVERS_PATH=" + filepath.Join(libraries, "no-video-drivers"),
		"VK_LOADER_LAYERS_DISABLE=~implicit~",
	}
	// Only Linux builds ship the manifest; the macOS build has no Vulkan loader.
	icd, err := filepath.Abs(filepath.Join(filepath.Dir(binary), "vk_swiftshader_icd.json"))
	if err != nil {
		return nil, fmt.Errorf("making the SwiftShader manifest path absolute: %w", err)
	}
	if _, err := os.Stat(icd); err == nil {
		env = append(env, "VK_DRIVER_FILES="+icd, "VK_ICD_FILENAMES="+icd)
	}
	return env, nil
}

// binaryPath finds the executable inside the directory rules_playwright
// fetched.
//
// The path inside it carries a Playwright revision, such as
// chromium-1124/chrome-linux/chrome, so this walks for the binary rather than
// hardcoding a path the next version bump would break.
func binaryPath() (string, error) {
	dir, err := runfiles.Rlocation(browserRlocation)
	if err != nil {
		return "", fmt.Errorf("resolving the Chromium runfile: %w", err)
	}

	var found string
	walkErr := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if name := d.Name(); name != "chrome" && name != "Chromium" && name != "headless_shell" {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.Mode()&0o111 == 0 {
			return nil
		}
		found = path
		return filepath.SkipAll
	})
	if walkErr != nil {
		return "", fmt.Errorf("walking %s for a Chromium executable: %w", dir, walkErr)
	}
	if found == "" {
		return "", fmt.Errorf("no chrome, Chromium or headless_shell executable under %s", dir)
	}
	return found, nil
}

// librariesPath returns the absolute path of the library directory.
//
// Absolute because Chromium's child processes inherit LD_LIBRARY_PATH, and a
// relative entry would be resolved against whatever directory each of them
// runs in.
func librariesPath() (string, error) {
	dir, err := runfiles.Rlocation(librariesRlocation)
	if err != nil {
		return "", fmt.Errorf("resolving the Chromium libraries runfile: %w", err)
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", fmt.Errorf("making %s absolute: %w", dir, err)
	}
	return abs, nil
}
