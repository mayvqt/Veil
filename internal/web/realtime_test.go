package web

import "testing"

func TestPresenceTracking(t *testing.T) {
	s := &Server{presenceCounts: map[string]int{}}
	if !s.trackPresenceConnect("u1") {
		t.Fatal("first connect should be online transition")
	}
	if s.trackPresenceConnect("u1") {
		t.Fatal("second connect should not be online transition")
	}
	if s.trackPresenceDisconnect("u1") {
		t.Fatal("first disconnect should keep one connection alive")
	}
	if !s.trackPresenceDisconnect("u1") {
		t.Fatal("final disconnect should be offline transition")
	}
	if s.trackPresenceDisconnect("u1") {
		t.Fatal("disconnect with no connections should be false")
	}
}
