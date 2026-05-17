package main

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

func importExternalKeys(path, restorePassphrase, serverBase string) (*keysFile, []byte, error) {
	cfg, err := loadKeysFile(path)
	if err != nil {
		return nil, nil, fmt.Errorf("could not read keys file: %w", err)
	}
	if strings.TrimSpace(cfg.CredentialID) == "" {
		return nil, nil, errors.New("credential_id missing in keys file")
	}

	var roomKey []byte
	if cfg.Format == "veil.keys.v3" && cfg.Wrap.CiphertextHex != "" {
		roomKey, err = decryptWrappedRoomKey(cfg, restorePassphrase)
		if err != nil {
			return nil, nil, err
		}
	} else if cfg.RoomKeyHex != "" {
		roomKey, err = hex.DecodeString(cfg.RoomKeyHex)
		if err != nil {
			return nil, nil, errors.New("invalid room_key_hex")
		}
	} else {
		return nil, nil, errors.New("no usable room key in file")
	}
	if len(roomKey) != 32 {
		return nil, nil, errors.New("room key length invalid")
	}

	normalized := &keysFile{
		Format:       "veil.keys.local.plain.v1",
		ServerBase:   serverBase,
		CredentialID: cfg.CredentialID,
		DisplayName:  cfg.DisplayName,
		RoomKeyHex:   hex.EncodeToString(roomKey),
	}
	return normalized, roomKey, nil
}

func saveLocalVault(path string, cfg *keysFile, passphrase string) error {
	plain, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	v, err := encryptBlobWithPassphrase(plain, passphrase)
	if err != nil {
		return err
	}

	salt, err := hex.DecodeString(v.KDF.SaltHex)
	if err != nil {
		return err
	}
	nonce, err := hex.DecodeString(v.Wrap.NonceHex)
	if err != nil {
		return err
	}
	ciphertext, err := hex.DecodeString(v.Wrap.CiphertextHex)
	if err != nil {
		return err
	}

	out := make([]byte, 0, len(vaultMagic)+1+4+1+len(salt)+1+len(nonce)+len(ciphertext))
	out = append(out, []byte(vaultMagic)...)
	out = append(out, 1)
	out = append(out, byte(v.KDF.Iterations>>24), byte(v.KDF.Iterations>>16), byte(v.KDF.Iterations>>8), byte(v.KDF.Iterations))
	out = append(out, byte(len(salt)))
	out = append(out, salt...)
	out = append(out, byte(len(nonce)))
	out = append(out, nonce...)
	out = append(out, ciphertext...)
	return os.WriteFile(path, out, 0600)
}

func loadLocalVault(path, passphrase string) (*keysFile, []byte, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}
	var v localVault
	if hasVaultMagic(b) {
		v, err = parseBinaryVault(b)
		if err != nil {
			return nil, nil, err
		}
	} else {
		if err := json.Unmarshal(b, &v); err != nil {
			return nil, nil, err
		}
	}
	plain, err := decryptBlobWithPassphrase(&v, passphrase)
	if err != nil {
		return nil, nil, err
	}
	var cfg keysFile
	if err := json.Unmarshal(plain, &cfg); err != nil {
		return nil, nil, err
	}
	roomKey, err := hex.DecodeString(cfg.RoomKeyHex)
	if err != nil || len(roomKey) != 32 {
		return nil, nil, errors.New("invalid room key in local vault")
	}
	return &cfg, roomKey, nil
}

func hasVaultMagic(b []byte) bool {
	return len(b) >= len(vaultMagic)+1 && string(b[:len(vaultMagic)]) == vaultMagic
}

func parseBinaryVault(b []byte) (localVault, error) {
	minLen := len(vaultMagic) + 1 + 4 + 1 + 1
	if len(b) < minLen {
		return localVault{}, errors.New("invalid local vault file")
	}
	pos := len(vaultMagic)
	version := b[pos]
	pos++
	if version != 1 {
		return localVault{}, errors.New("unsupported local vault version")
	}
	iters := int(b[pos])<<24 | int(b[pos+1])<<16 | int(b[pos+2])<<8 | int(b[pos+3])
	pos += 4
	saltLen := int(b[pos])
	pos++
	if len(b) < pos+saltLen+1 {
		return localVault{}, errors.New("invalid local vault salt")
	}
	salt := b[pos : pos+saltLen]
	pos += saltLen
	nonceLen := int(b[pos])
	pos++
	if len(b) < pos+nonceLen {
		return localVault{}, errors.New("invalid local vault nonce")
	}
	nonce := b[pos : pos+nonceLen]
	pos += nonceLen
	ciphertext := b[pos:]
	if len(ciphertext) == 0 {
		return localVault{}, errors.New("invalid local vault ciphertext")
	}

	v := localVault{Format: localVaultFormat}
	v.KDF.Name = "PBKDF2-HMAC-SHA256"
	v.KDF.Iterations = iters
	v.KDF.SaltHex = hex.EncodeToString(salt)
	v.Wrap.Alg = "AES-256-GCM"
	v.Wrap.NonceHex = hex.EncodeToString(nonce)
	v.Wrap.CiphertextHex = hex.EncodeToString(ciphertext)
	return v, nil
}

func loadKeysFile(path string) (*keysFile, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg keysFile
	if err := json.Unmarshal(b, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
