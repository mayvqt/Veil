package chat

import "testing"

func TestHubBroadcastAndRemove(t *testing.T) {
	h := NewHub()
	ch := make(chan Outbound, 1)
	h.Add(ch)
	msg := Outbound{Type: "message", Data: map[string]string{"id": "1"}}
	h.Broadcast(msg)
	got := <-ch
	if got.Type != "message" || got.Data["id"] != "1" {
		t.Fatalf("unexpected broadcast payload: %#v", got)
	}
	h.Remove(ch)
	_, ok := <-ch
	if ok {
		t.Fatal("expected removed channel to be closed")
	}
}

func TestHubBroadcastNonBlockingOnFullChannel(t *testing.T) {
	h := NewHub()
	ch := make(chan Outbound, 1)
	h.Add(ch)
	ch <- Outbound{Type: "full"}
	// Should not block/panic even though channel is full.
	h.Broadcast(Outbound{Type: "new"})
}
