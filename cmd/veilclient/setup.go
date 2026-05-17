package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type setupStep int

const (
	setupServer setupStep = iota
	setupUnlockVault
	setupImportChoice
	setupKeyPath
	setupRestorePass
	setupLocalPass
	setupDone
)

type setupResult struct {
	cfg        *keysFile
	roomKey    []byte
	serverBase string
	err        error
}

type setupModel struct {
	step        setupStep
	input       string
	serverBase  string
	vaultPath   string
	appDir      string
	defaultPath string
	keyPath     string
	restorePass string
	message     string
	result      setupResult
	width       int
	height      int
}

func runSetupWizard(vaultPath, appDir, defaultBase string) (*keysFile, []byte, string, error) {
	m := newSetupModel(vaultPath, appDir, defaultBase)
	final, err := tea.NewProgram(m, tea.WithAltScreen()).Run()
	if err != nil {
		return nil, nil, "", err
	}
	out := final.(setupModel)
	if out.result.err != nil {
		return nil, nil, "", out.result.err
	}
	return out.result.cfg, out.result.roomKey, out.result.serverBase, nil
}

func newSetupModel(vaultPath, appDir, defaultBase string) setupModel {
	step := setupServer
	return setupModel{
		step:        step,
		input:       defaultBase,
		serverBase:  defaultBase,
		vaultPath:   vaultPath,
		appDir:      appDir,
		defaultPath: suggestKeysPath(appDir),
		message:     "Configure your secure room connection.",
	}
}

func (m setupModel) Init() tea.Cmd { return nil }

func (m setupModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch x := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = x.Width
		m.height = x.Height
		return m, nil
	case tea.KeyMsg:
		switch x.String() {
		case "ctrl+c", "esc":
			m.result.err = errors.New("setup cancelled")
			return m, tea.Quit
		case "backspace":
			if len(m.input) > 0 {
				m.input = m.input[:len(m.input)-1]
			}
			return m, nil
		case "enter":
			return m.advance()
		default:
			if len(x.String()) == 1 {
				m.input += x.String()
			}
		}
	}
	return m, nil
}

func (m setupModel) advance() (tea.Model, tea.Cmd) {
	value := strings.TrimSpace(m.input)
	switch m.step {
	case setupServer:
		if value == "" {
			value = m.serverBase
		}
		m.serverBase = normalizeServerBase(value)
		if fileExists(m.vaultPath) {
			m.step = setupUnlockVault
			m.input = ""
			m.message = "Local encrypted vault found."
			return m, nil
		}
		m.step = setupImportChoice
		m.input = "y"
		m.message = "No local vault found. Import room.keys to continue."
		return m, nil
	case setupUnlockVault:
		cfg, roomKey, err := loadLocalVault(m.vaultPath, value)
		if err != nil {
			m.message = "Unlock failed: " + err.Error()
			m.input = ""
			return m, nil
		}
		cfg.ServerBase = m.serverBase
		m.result = setupResult{cfg: cfg, roomKey: roomKey, serverBase: m.serverBase}
		m.step = setupDone
		return m, tea.Quit
	case setupImportChoice:
		answer := strings.ToLower(value)
		if answer == "n" || answer == "no" {
			m.result.err = errors.New("no keys loaded")
			return m, tea.Quit
		}
		m.step = setupKeyPath
		m.input = m.defaultPath
		m.message = "Choose your exported room.keys file."
		return m, nil
	case setupKeyPath:
		if value == "" {
			value = m.defaultPath
		}
		m.keyPath = value
		m.step = setupRestorePass
		m.input = ""
		m.message = "Enter the passphrase used when exporting room.keys."
		return m, nil
	case setupRestorePass:
		m.restorePass = value
		m.step = setupLocalPass
		m.input = ""
		m.message = "Set a local vault passphrase, or leave empty to reuse the restore passphrase."
		return m, nil
	case setupLocalPass:
		localPass := value
		if localPass == "" {
			localPass = m.restorePass
		}
		cfg, roomKey, err := importExternalKeys(m.keyPath, m.restorePass, m.serverBase)
		if err != nil {
			m.message = "Import failed: " + err.Error()
			m.step = setupKeyPath
			m.input = m.keyPath
			return m, nil
		}
		if err := saveLocalVault(m.vaultPath, cfg, localPass); err != nil {
			m.message = "Could not save local vault: " + err.Error()
			m.input = ""
			return m, nil
		}
		m.result = setupResult{cfg: cfg, roomKey: roomKey, serverBase: m.serverBase}
		m.step = setupDone
		return m, tea.Quit
	}
	return m, nil
}

func (m setupModel) View() string {
	width := max(m.width, 72)
	height := max(m.height, 22)
	boxWidth := min(width-8, 84)
	if boxWidth < 56 {
		boxWidth = 56
	}
	contentWidth := boxWidth - 6

	title := lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("231")).Render("Veil Client")
	accent := lipgloss.NewStyle().Foreground(lipgloss.Color("79")).Render("private encrypted chat")
	status := lipgloss.NewStyle().Foreground(lipgloss.Color("109")).Width(contentWidth).Render(m.message)
	label := lipgloss.NewStyle().Foreground(lipgloss.Color("187")).Bold(true).Width(contentWidth).Render(m.promptLabel())
	help := lipgloss.NewStyle().Foreground(lipgloss.Color("245")).Width(contentWidth).Render(m.helpText())
	input := lipgloss.NewStyle().
		Border(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("72")).
		Foreground(lipgloss.Color("255")).
		Padding(0, 1).
		Width(contentWidth).
		Render(m.displayInput())
	footer := lipgloss.NewStyle().Foreground(lipgloss.Color("242")).Width(contentWidth).Render("Enter to continue  Esc to cancel")

	panel := lipgloss.NewStyle().
		Width(boxWidth).
		Padding(1, 2).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("72")).
		Render(lipgloss.JoinVertical(lipgloss.Left, title+"  "+accent, "", status, "", label, input, help, "", footer))

	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, panel)
}

func (m setupModel) promptLabel() string {
	switch m.step {
	case setupServer:
		return "Server URL"
	case setupUnlockVault:
		return "Vault passphrase"
	case setupImportChoice:
		return "Import room.keys now? [Y/n]"
	case setupKeyPath:
		return "room.keys path"
	case setupRestorePass:
		return "Restore passphrase"
	case setupLocalPass:
		return "Local vault passphrase"
	default:
		return "Ready"
	}
}

func (m setupModel) helpText() string {
	switch m.step {
	case setupServer:
		return "Use your HTTPS domain when connecting through Nginx Proxy Manager or Cloudflare."
	case setupUnlockVault:
		return "Your key vault stays next to this executable."
	case setupImportChoice:
		return "Import once; future launches unlock the local encrypted vault."
	case setupKeyPath:
		return "Detected default: " + m.defaultPath
	case setupRestorePass:
		return "This passphrase decrypts your exported key file."
	case setupLocalPass:
		return "This protects the local vault used by the TUI client."
	default:
		return ""
	}
}

func (m setupModel) displayInput() string {
	if m.step == setupUnlockVault || m.step == setupRestorePass || m.step == setupLocalPass {
		if m.input == "" {
			return ""
		}
		return strings.Repeat("*", len(m.input))
	}
	return m.input
}

func normalizeServerBase(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		return raw
	}
	return "http://" + raw
}

func suggestKeysPath(appDir string) string {
	candidates := []string{
		filepath.Join(appDir, "room.keys"),
		"room.keys",
	}
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, "room.keys"))
	}
	for _, path := range candidates {
		if fileExists(path) {
			return path
		}
	}
	return "room.keys"
}
