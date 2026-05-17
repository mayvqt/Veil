package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/gorilla/websocket"
)

func (m model) Init() tea.Cmd { return readWS(m.ws, m.roomKey) }

func readWS(c *websocket.Conn, roomKey []byte) tea.Cmd {
	return func() tea.Msg {
		_, b, err := c.ReadMessage()
		if err != nil {
			return wsDisconnectedMsg{ws: c, err: err}
		}
		var x msgIn
		_ = json.Unmarshal(b, &x)
		if x.Type != "message" {
			return incomingMsg{ws: c}
		}
		plain := decryptMessage(roomKey, x.Data["nonce"], x.Data["ciphertext"])
		return incomingMsg{ws: c, user: x.Data["display_name"], text: plain}
	}
}

func reconnectWS(base, credential string) tea.Cmd {
	return func() tea.Msg {
		ws, nextBase, session, err := connectSession(base, credential)
		return wsReconnectMsg{ws: ws, base: nextBase, session: session, err: err}
	}
}

func retryReconnectAfter(d time.Duration) tea.Cmd {
	return tea.Tick(d, func(time.Time) tea.Msg {
		return wsReconnectTickMsg{}
	})
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch x := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = x.Width
		m.height = x.Height
		m.ready = true
		return m, nil
	case tea.KeyMsg:
		s := x.String()
		if s == "ctrl+c" {
			return m, tea.Quit
		}
		if s == "enter" {
			text := strings.TrimSpace(convertEmoticons(m.input))
			m.input = ""
			if text == "" {
				return m, nil
			}
			ct, nonce, err := encryptMessage(m.roomKey, text)
			if err != nil {
				m.lines = append(m.lines, line{user: "system", text: "encrypt error: " + err.Error()})
				return m, nil
			}
			payload := map[string]string{"ciphertext": ct, "nonce": nonce}
			if err := m.ws.WriteJSON(payload); err != nil {
				m.lines = append(m.lines, line{user: "system", text: "send error: " + err.Error()})
				if !m.reconnect {
					m.reconnect = true
					m.lines = append(m.lines, line{user: "system", text: "reconnecting"})
					if m.ws != nil {
						_ = m.ws.Close()
					}
					return m, reconnectWS(m.serverBase, m.credential)
				}
			} else {
				m.pending = append(m.pending, line{user: "me", text: text})
			}
			return m, nil
		}
		if s == "backspace" && len(m.input) > 0 {
			runes := []rune(m.input)
			m.input = string(runes[:len(runes)-1])
			return m, nil
		}
		if s == " " {
			m.input = convertEmoticons(m.input) + " "
			return m, nil
		}
		if len(s) == 1 {
			m.input += s
		}
		return m, nil
	case incomingMsg:
		if x.ws != nil && m.ws != nil && x.ws != m.ws {
			return m, nil
		}
		if strings.TrimSpace(x.user) == "" && strings.TrimSpace(x.text) == "" {
			return m, readWS(m.ws, m.roomKey)
		}
		if len(m.pending) > 0 && x.user == m.selfName {
			nextPending := make([]line, 0, len(m.pending))
			matched := false
			for _, p := range m.pending {
				if !matched && p.text == x.text {
					matched = true
					continue
				}
				nextPending = append(nextPending, p)
			}
			m.pending = nextPending
		}
		m.lines = append(m.lines, line{user: x.user, text: x.text})
		return m, readWS(m.ws, m.roomKey)
	case wsDisconnectedMsg:
		if x.ws != nil && m.ws != nil && x.ws != m.ws {
			return m, nil
		}
		if !m.reconnect {
			m.reconnect = true
			m.lines = append(m.lines, line{user: "system", text: "disconnected; reconnecting"})
			if x.ws != nil {
				_ = x.ws.Close()
			}
			return m, reconnectWS(m.serverBase, m.credential)
		}
		return m, nil
	case wsReconnectMsg:
		if x.err != nil {
			m.lines = append(m.lines, line{user: "system", text: "reconnect failed; retrying"})
			return m, retryReconnectAfter(2 * time.Second)
		}
		if m.ws != nil && m.ws != x.ws {
			_ = m.ws.Close()
		}
		m.ws = x.ws
		m.serverBase = x.base
		m.session = x.session
		m.reconnect = false
		m.lines = append(m.lines, line{user: "system", text: "reconnected"})
		return m, readWS(m.ws, m.roomKey)
	case wsReconnectTickMsg:
		return m, reconnectWS(m.serverBase, m.credential)
	}
	return m, nil
}

func pastelFor(name string) lipgloss.Color {
	palette := []lipgloss.Color{"79", "222", "210", "117", "143", "215", "122", "223"}
	h := 0
	for _, ch := range name {
		h = h*31 + int(ch)
	}
	if h < 0 {
		h = -h
	}
	return palette[h%len(palette)]
}

func (m model) View() string {
	if !m.ready {
		return "Loading Veil UI..."
	}

	outerW := min(m.width-4, 132)
	outerW = max(outerW, 60)
	outerH := min(m.height-2, 42)
	outerH = max(outerH, 14)

	headerStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("234")).Background(lipgloss.Color("79")).Bold(true).Padding(0, 1)
	subtle := lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	inputStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("255"))
	panelStyle := lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("72")).Background(lipgloss.Color("235")).Padding(1, 2).Width(outerW).Height(outerH)

	contentW := max(outerW-6, 20)
	msgHeight := outerH - 8
	if msgHeight < 3 {
		msgHeight = 3
	}
	merged := make([]line, 0, len(m.lines)+len(m.pending))
	merged = append(merged, m.lines...)
	merged = append(merged, m.pending...)

	start := 0
	if len(merged) > msgHeight {
		start = len(merged) - msgHeight
	}

	rendered := make([]string, 0, len(merged)-start)
	for i, ln := range merged[start:] {
		name := ln.user
		if strings.TrimSpace(name) == "" {
			name = "unknown"
		}
		nameStyle := lipgloss.NewStyle().Foreground(pastelFor(name)).Bold(true)
		if name == "system" {
			nameStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("222")).Bold(true)
		}
		if name == "me" {
			nameStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("79")).Bold(true)
		}
		textStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("252"))
		if start+i >= len(m.lines) {
			textStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("246")).Italic(true)
		}
		rendered = append(rendered, nameStyle.Render(name)+lipgloss.NewStyle().Foreground(lipgloss.Color("243")).Render(": ")+textStyle.Render(displayMessageText(ln.text)))
	}

	chatArea := lipgloss.NewStyle().Width(contentW).Height(msgHeight).Border(lipgloss.NormalBorder()).BorderForeground(lipgloss.Color("59")).Padding(0, 1).Render(strings.Join(rendered, "\n"))
	header := headerStyle.Render(" "+m.roomName+" ") + " " + subtle.Render("AES-256-GCM E2EE") + "  " + subtle.Render(m.serverBase)
	meta := subtle.Render("You: " + m.selfName + "   Lines: " + fmt.Sprintf("%d", len(m.lines)))
	inputLine := lipgloss.NewStyle().Border(lipgloss.NormalBorder()).BorderForeground(lipgloss.Color("72")).Padding(0, 1).Width(contentW).Render(inputStyle.Render(displayMessageText(m.input)))
	content := lipgloss.JoinVertical(lipgloss.Left, header, meta, chatArea, inputLine)
	boxed := panelStyle.Render(content)
	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, boxed)
}
