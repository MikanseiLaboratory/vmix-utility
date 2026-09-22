package scraper

import "testing"

func TestIncludeShortcutSkipsHeaderAndBlankRows(t *testing.T) {
	if includeShortcut("", "") {
		t.Fatal("blank rows must be dropped")
	}
	if includeShortcut("Name", "Description") {
		t.Fatal("the column header must be dropped")
	}
	if !includeShortcut("Cut", "Cut") {
		t.Fatal("real functions must be kept")
	}
	if !includeShortcut("OverlayInput8", "Overlay") {
		t.Fatal("overlay functions must be kept")
	}
}
