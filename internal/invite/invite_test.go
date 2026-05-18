package invite

import "testing"

func TestHashTokenDeterministicAndDistinct(t *testing.T) {
	a := HashToken("abc")
	b := HashToken("abc")
	c := HashToken("def")
	if a != b {
		t.Fatalf("expected deterministic hash, got %q vs %q", a, b)
	}
	if a == c {
		t.Fatalf("expected distinct hashes, both %q", a)
	}
	if len(a) == 0 {
		t.Fatal("expected non-empty hash")
	}
}
