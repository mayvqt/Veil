package web

import (
	"net/http"
	"strings"
	"time"

	"veil/internal/chat"

	"github.com/gorilla/websocket"
)

func (s *Server) ws(w http.ResponseWriter, r *http.Request) {
	u, err := s.userFromCookie(r)
	if err != nil {
		t := sessionTokenFromRequest(r)
		if t == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		u, err = s.userFromSignedToken(t)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
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
	c.SetReadLimit(64 * 1024)

	out := make(chan chat.Outbound, 16)
	s.Hub.Add(out)
	defer s.Hub.Remove(out)

	go func() {
		for msg := range out {
			_ = c.WriteJSON(msg)
		}
	}()

	for {
		var in struct{ Ciphertext, Nonce string }
		if err := c.ReadJSON(&in); err != nil {
			return
		}
		active, err := s.Store.IsUserActive(u.ID)
		if err != nil || !active {
			_ = c.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "user access revoked"), nowPlusSeconds(2))
			return
		}
		if strings.TrimSpace(in.Ciphertext) == "" || strings.TrimSpace(in.Nonce) == "" {
			continue
		}
		if err := s.Store.SaveMessage(u.ID, in.Ciphertext, in.Nonce); err != nil {
			continue
		}
		s.Hub.Broadcast(chat.Outbound{Type: "message", Data: map[string]string{"display_name": u.DisplayName, "ciphertext": in.Ciphertext, "nonce": in.Nonce}})
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

func nowPlusSeconds(seconds int) time.Time {
	return time.Now().Add(time.Duration(seconds) * time.Second)
}
