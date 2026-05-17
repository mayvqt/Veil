package main

import "github.com/gorilla/websocket"

const (
	pbkdf2Iterations = 600000
	localVaultFormat = "veil.local.v1"
	vaultMagic       = "VEILVAULT1"
)

type msgIn struct {
	Type string            `json:"type"`
	Data map[string]string `json:"data"`
}

type keysFile struct {
	Format       string `json:"format"`
	ServerBase   string `json:"server_base"`
	CredentialID string `json:"credential_id"`
	DisplayName  string `json:"display_name"`
	RoomKeyHex   string `json:"room_key_hex"`
	KDF          struct {
		Name       string `json:"name"`
		Iterations int    `json:"iterations"`
		SaltHex    string `json:"salt_hex"`
	} `json:"kdf"`
	Wrap struct {
		Alg           string `json:"alg"`
		NonceHex      string `json:"nonce_hex"`
		CiphertextHex string `json:"ciphertext_hex"`
	} `json:"wrap"`
}

type localVault struct {
	Format string `json:"format"`
	KDF    struct {
		Name       string `json:"name"`
		Iterations int    `json:"iterations"`
		SaltHex    string `json:"salt_hex"`
	} `json:"kdf"`
	Wrap struct {
		Alg           string `json:"alg"`
		NonceHex      string `json:"nonce_hex"`
		CiphertextHex string `json:"ciphertext_hex"`
	} `json:"wrap"`
}

type line struct {
	user string
	text string
}

type incomingMsg struct {
	ws   *websocket.Conn
	user string
	text string
}

type wsDisconnectedMsg struct {
	ws  *websocket.Conn
	err error
}

type wsReconnectMsg struct {
	ws      *websocket.Conn
	base    string
	session string
	err     error
}

type wsReconnectTickMsg struct{}

type model struct {
	lines      []line
	pending    []line
	input      string
	ws         *websocket.Conn
	roomKey    []byte
	roomName   string
	serverBase string
	session    string
	credential string
	selfName   string
	width      int
	height     int
	ready      bool
	reconnect  bool
}
