package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/pbkdf2"
)

func decryptMessage(roomKey []byte, nonceHex, cipherHex string) string {
	if len(roomKey) != 32 {
		return "[missing room key]"
	}
	nonce, err := hex.DecodeString(nonceHex)
	if err != nil {
		return "[invalid nonce]"
	}
	ciphertext, err := hex.DecodeString(cipherHex)
	if err != nil {
		return "[invalid ciphertext]"
	}
	block, err := aes.NewCipher(roomKey)
	if err != nil {
		return "[cipher init failed]"
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "[gcm init failed]"
	}
	plain, err := aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "[decrypt failed]"
	}
	return string(plain)
}

func encryptMessage(roomKey []byte, text string) (string, string, error) {
	if len(roomKey) != 32 {
		return "", "", fmt.Errorf("room key must be 32 bytes")
	}
	block, err := aes.NewCipher(roomKey)
	if err != nil {
		return "", "", err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", err
	}
	ciphertext := aead.Seal(nil, nonce, []byte(text), nil)
	return hex.EncodeToString(ciphertext), hex.EncodeToString(nonce), nil
}

func encryptBlobWithPassphrase(plain []byte, passphrase string) (*localVault, error) {
	salt := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, err
	}
	derived := pbkdf2.Key([]byte(passphrase), salt, pbkdf2Iterations, 32, sha256.New)
	block, err := aes.NewCipher(derived)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ciphertext := aead.Seal(nil, nonce, plain, nil)

	v := &localVault{Format: localVaultFormat}
	v.KDF.Name = "PBKDF2-HMAC-SHA256"
	v.KDF.Iterations = pbkdf2Iterations
	v.KDF.SaltHex = hex.EncodeToString(salt)
	v.Wrap.Alg = "AES-256-GCM"
	v.Wrap.NonceHex = hex.EncodeToString(nonce)
	v.Wrap.CiphertextHex = hex.EncodeToString(ciphertext)
	return v, nil
}

func decryptBlobWithPassphrase(v *localVault, passphrase string) ([]byte, error) {
	salt, err := hex.DecodeString(v.KDF.SaltHex)
	if err != nil {
		return nil, errors.New("invalid vault salt")
	}
	nonce, err := hex.DecodeString(v.Wrap.NonceHex)
	if err != nil {
		return nil, errors.New("invalid vault nonce")
	}
	ciphertext, err := hex.DecodeString(v.Wrap.CiphertextHex)
	if err != nil {
		return nil, errors.New("invalid vault ciphertext")
	}
	iters := v.KDF.Iterations
	if iters <= 0 {
		iters = pbkdf2Iterations
	}
	derived := pbkdf2.Key([]byte(passphrase), salt, iters, 32, sha256.New)
	block, err := aes.NewCipher(derived)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plain, err := aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, errors.New("wrong passphrase or corrupted vault")
	}
	return plain, nil
}

func decryptWrappedRoomKey(cfg *keysFile, passphrase string) ([]byte, error) {
	salt, err := hex.DecodeString(cfg.KDF.SaltHex)
	if err != nil {
		return nil, fmt.Errorf("invalid salt")
	}
	nonce, err := hex.DecodeString(cfg.Wrap.NonceHex)
	if err != nil {
		return nil, fmt.Errorf("invalid nonce")
	}
	ciphertext, err := hex.DecodeString(cfg.Wrap.CiphertextHex)
	if err != nil {
		return nil, fmt.Errorf("invalid ciphertext")
	}
	iters := cfg.KDF.Iterations
	if iters <= 0 {
		iters = pbkdf2Iterations
	}
	derived := pbkdf2.Key([]byte(passphrase), salt, iters, 32, sha256.New)
	block, err := aes.NewCipher(derived)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plain, err := aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("wrong passphrase or corrupted file")
	}
	if len(plain) != 32 {
		return nil, fmt.Errorf("invalid room key length")
	}
	return plain, nil
}
