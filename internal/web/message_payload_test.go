package web

import (
	"testing"

	"veil/internal/db"
)

func TestOutboundMessageData(t *testing.T) {
	msg := &db.Message{
		ID:          "m1",
		RowID:       42,
		SenderID:    "u1",
		DisplayName: "alice",
		Ciphertext:  "ct",
		Nonce:       "n",
		ReplyToID:   "m0",
		EditedAt:    "e",
		DeletedAt:   "",
		CreatedAt:   "2026-01-01T00:00:00Z",
	}
	out := outboundMessageData(msg, "client-1")
	if out["id"] != "m1" || out["row_id"] != "42" || out["client_msg_id"] != "client-1" {
		t.Fatalf("unexpected outbound map: %#v", out)
	}
}
