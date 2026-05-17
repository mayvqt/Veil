package main

import (
	"fmt"
	"os"
	"path/filepath"

	tea "github.com/charmbracelet/bubbletea"
)

func main() {
	if handleImportCommand(os.Args) {
		return
	}

	if err := runClient(); err != nil {
		fmt.Println(err)
	}
}

func handleImportCommand(args []string) bool {
	if len(args) <= 1 || args[1] != "import" {
		return false
	}
	if len(args) < 3 {
		fmt.Println("usage: veilclient import room.keys")
		return true
	}
	b, err := os.ReadFile(args[2])
	if err != nil {
		fmt.Println(err)
		return true
	}
	if err := os.WriteFile(".room.keys", b, 0600); err != nil {
		fmt.Println(err)
		return true
	}
	fmt.Println("Imported keys to .room.keys")
	return true
}

func runClient() error {
	appDir, err := executableDir()
	if err != nil {
		return fmt.Errorf("could not detect app directory: %w", err)
	}

	vaultPath := filepath.Join(appDir, "veil.keys.vault")
	defaultBase := getenv("VEIL_BASE", "http://127.0.0.1:3847")

	cfg, roomKey, serverBase, err := runSetupWizard(vaultPath, appDir, defaultBase)
	if err != nil {
		return err
	}

	ws, base, sessionToken, err := connectSession(serverBase, cfg.CredentialID)
	if err != nil {
		return fmt.Errorf("session failed: %w", err)
	}
	defer ws.Close()

	displayName := cfg.DisplayName
	if displayName == "" {
		displayName = "member"
	}

	history := fetchHistory(base, sessionToken, roomKey)
	roomName := fetchRoomName(base, sessionToken)
	if roomName == "" {
		roomName = "Veil Room"
	}

	m := model{
		ws:         ws,
		roomKey:    roomKey,
		roomName:   roomName,
		serverBase: base,
		session:    sessionToken,
		credential: cfg.CredentialID,
		selfName:   displayName,
		lines: append([]line{
			{user: "system", text: "connected"},
			{user: "system", text: "local vault ready"},
		}, history...),
	}

	p := tea.NewProgram(m, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		return err
	}
	return nil
}
