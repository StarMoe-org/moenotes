//go:build unix

package ssr

import (
	"syscall"

	"github.com/StarMoe-org/moenotes/server/internal/logx"
)

// disableCoreDumps sets this process's soft core limit to 0, which the Next.js server inherits on every restart. A V8
// heap abort would otherwise leave a core of the heap's size in the container's writable layer, where nothing removes it.
func disableCoreDumps() {
	var limit syscall.Rlimit
	if err := syscall.Getrlimit(syscall.RLIMIT_CORE, &limit); err != nil {
		logx.Printf("could not read the core dump limit: %v", err)
		return
	}
	limit.Cur = 0
	if err := syscall.Setrlimit(syscall.RLIMIT_CORE, &limit); err != nil {
		logx.Printf("could not disable core dumps: %v", err)
	}
}
