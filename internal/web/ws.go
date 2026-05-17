package web

import (
	"net/http"
	"strings"
	"time"

	"veil/internal/chat"

	"github.com/gorilla/websocket"
)

const (
	wsWriteWait = 10 * time.Second
	wsPongWait  = 60 * time.Second
	wsPingEvery = (wsPongWait * 9) / 10
)

func (s *Server) ws(w http.ResponseWriter, r *http.Request) {
	u, ok := s.requireAPIUser(w, r)
	if !ok {
		return
	}
	upgrader := websocket.Upgrader{
		CheckOrigin:     s.checkWebSocketOrigin,
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer c.Close()
	c.SetReadLimit(5 * 1024 * 1024)
	_ = c.SetReadDeadline(time.Now().Add(wsPongWait))
	c.SetPongHandler(func(string) error {
		return c.SetReadDeadline(time.Now().Add(wsPongWait))
	})

	out := make(chan chat.Outbound, 16)
	closeReason := make(chan []byte, 1)
	s.Hub.Add(out)
	defer s.Hub.Remove(out)

	go func() {
		ticker := time.NewTicker(wsPingEvery)
		defer ticker.Stop()
		defer c.Close()

		for {
			select {
			case msg, ok := <-out:
				_ = c.SetWriteDeadline(time.Now().Add(wsWriteWait))
				if !ok {
					_ = c.WriteMessage(websocket.CloseMessage, []byte{})
					return
				}
				if err := c.WriteJSON(msg); err != nil {
					return
				}
			case reason := <-closeReason:
				_ = c.SetWriteDeadline(time.Now().Add(wsWriteWait))
				_ = c.WriteMessage(websocket.CloseMessage, reason)
				return
			case <-ticker.C:
				_ = c.SetWriteDeadline(time.Now().Add(wsWriteWait))
				if err := c.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()

	for {
		var in struct{ Ciphertext, Nonce string }
		if err := c.ReadJSON(&in); err != nil {
			return
		}
		active, err := s.Store.IsUserActive(u.ID)
		if err != nil || !active {
			select {
			case closeReason <- websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "user access revoked"):
			default:
			}
			return
		}
		if strings.TrimSpace(in.Ciphertext) == "" || strings.TrimSpace(in.Nonce) == "" {
			continue
		}
		msg, err := s.Store.SaveMessage(u.ID, u.DisplayName, in.Ciphertext, in.Nonce)
		if err != nil {
			continue
		}
		if s.RetainDays > 0 {
			_ = s.Store.PruneMessagesOlderThan(s.RetainDays)
		}
		if s.RetainCount > 0 {
			_ = s.Store.PruneMessagesToLimit(s.RetainCount)
		}
		s.Hub.Broadcast(chat.Outbound{Type: "message", Data: map[string]string{"id": msg.ID, "created_at": msg.CreatedAt, "display_name": msg.DisplayName, "ciphertext": msg.Ciphertext, "nonce": msg.Nonce}})
	}
}

func (s *Server) checkWebSocketOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	if _, ok := s.AllowedOrigins[origin]; ok {
		return true
	}
	return origin == requestOrigin(r)
}

func requestOrigin(r *http.Request) string {
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		if r.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	return proto + "://" + host
}
