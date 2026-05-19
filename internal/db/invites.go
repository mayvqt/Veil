package db

import (
	"errors"
	"strconv"

	"github.com/google/uuid"
)

func (s *Store) CreateInvite(tokenHash, createdBy string, ttlHours, maxUses int) (string, error) {
	id := uuid.NewString()
	_, err := s.DB.Exec(
		"INSERT INTO invites (id, token_hash, created_by, expires_at, max_uses, created_at) VALUES (?, ?, ?, datetime('now', ?), ?, ?)",
		id, tokenHash, createdBy, "+"+strconv.Itoa(ttlHours)+" hours", maxUses, now(),
	)
	return id, err
}

func (s *Store) ValidateInvite(tokenHash string) (string, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	var id string
	err = tx.QueryRow(`
SELECT id FROM invites
WHERE token_hash=? AND revoked=0 AND uses < max_uses AND datetime(expires_at) > datetime('now')
LIMIT 1`, tokenHash).Scan(&id)
	if err != nil {
		return "", err
	}
	res, err := tx.Exec("UPDATE invites SET uses = uses + 1 WHERE id=? AND uses < max_uses", id)
	if err != nil {
		return "", err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return "", err
	}
	if affected != 1 {
		return "", errors.New("invite no longer available")
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return id, nil
}

func (s *Store) ListInvites(limit int) ([]InviteInfo, error) {
	rows, err := s.DB.Query(`
SELECT id, expires_at, max_uses, uses, revoked, created_at
FROM invites
ORDER BY created_at DESC
LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]InviteInfo, 0, limit)
	for rows.Next() {
		var item InviteInfo
		var revoked int
		if err := rows.Scan(&item.ID, &item.ExpiresAt, &item.MaxUses, &item.Uses, &revoked, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.Revoked = revoked == 1
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) RevokeInvite(inviteID string) error {
	_, err := s.DB.Exec("UPDATE invites SET revoked=1 WHERE id=?", inviteID)
	return err
}

func (s *Store) RevokeUnusedInvites() (int64, error) {
	res, err := s.DB.Exec("UPDATE invites SET revoked=1 WHERE revoked=0 AND uses=0")
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *Store) PurgeUsedOrRevokedInvites() (int64, error) {
	res, err := s.DB.Exec("DELETE FROM invites WHERE revoked=1 OR uses >= max_uses")
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
