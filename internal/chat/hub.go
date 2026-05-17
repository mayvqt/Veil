package chat

import "sync"

type Outbound struct {
	Type string            `json:"type"`
	Data map[string]string `json:"data"`
}

type Hub struct {
	mu      sync.Mutex
	clients map[chan Outbound]struct{}
}

func NewHub() *Hub { return &Hub{clients: map[chan Outbound]struct{}{}} }

func (h *Hub) Add(ch chan Outbound) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[ch] = struct{}{}
}

func (h *Hub) Remove(ch chan Outbound) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, ch)
	close(ch)
}

func (h *Hub) Broadcast(msg Outbound) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clients {
		select {
		case ch <- msg:
		default:
		}
	}
}
