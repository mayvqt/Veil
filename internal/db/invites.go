package db

import (
	"errors"
	"strconv"

	"github.com/google/uuid"
)

func (s *Store) CreateInvite(roomID, tokenHash, createdBy string, ttlHours, maxUses int) (string, error) {
	id := uuid.NewString()
	_, err := s.DB.Exec(
		"INSERT INTO invites (id, room_id, token_hash, created_by, expires_at, max_uses, created_at) VALUES (?, ?, ?, ?, datetime('now', ?), ?, ?)",
		id, roomID, tokenHash, createdBy, "+"+strconv.Itoa(ttlHours)+" hours", maxUses, now(),
	)
	return id, err
}

func (s *Store) ValidateInvite(tokenHash string) (InviteMatch, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return InviteMatch{}, err
	}
	defer tx.Rollback()

	var match InviteMatch
	err = tx.QueryRow(`
SELECT id, room_id FROM invites
WHERE token_hash=? AND revoked=0 AND uses < max_uses AND datetime(expires_at) > datetime('now')
LIMIT 1`, tokenHash).Scan(&match.ID, &match.RoomID)
	if err != nil {
		return InviteMatch{}, err
	}
	res, err := tx.Exec("UPDATE invites SET uses = uses + 1 WHERE id=? AND uses < max_uses", match.ID)
	if err != nil {
		return InviteMatch{}, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return InviteMatch{}, err
	}
	if affected != 1 {
		return InviteMatch{}, errors.New("invite no longer available")
	}
	if err := tx.Commit(); err != nil {
		return InviteMatch{}, err
	}
	return match, nil
}

func (s *Store) ListInvites(limit int) ([]InviteInfo, error) {
	rows, err := s.DB.Query(`
SELECT id, room_id, expires_at, max_uses, uses, revoked, created_at
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
		if err := rows.Scan(&item.ID, &item.RoomID, &item.ExpiresAt, &item.MaxUses, &item.Uses, &revoked, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.Revoked = revoked == 1
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) ListInvitesByRoom(roomID string, limit int) ([]InviteInfo, error) {
	rows, err := s.DB.Query(`
SELECT id, room_id, expires_at, max_uses, uses, revoked, created_at
FROM invites
WHERE room_id=?
ORDER BY created_at DESC
LIMIT ?`, roomID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]InviteInfo, 0, limit)
	for rows.Next() {
		var item InviteInfo
		var revoked int
		if err := rows.Scan(&item.ID, &item.RoomID, &item.ExpiresAt, &item.MaxUses, &item.Uses, &revoked, &item.CreatedAt); err != nil {
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

func (s *Store) RevokeInviteInRoom(roomID, inviteID string) error {
	_, err := s.DB.Exec("UPDATE invites SET revoked=1 WHERE id=? AND room_id=?", inviteID, roomID)
	return err
}

func (s *Store) RevokeUnusedInvites() (int64, error) {
	res, err := s.DB.Exec("UPDATE invites SET revoked=1 WHERE revoked=0 AND uses=0")
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *Store) RevokeUnusedInvitesInRoom(roomID string) (int64, error) {
	res, err := s.DB.Exec("UPDATE invites SET revoked=1 WHERE room_id=? AND revoked=0 AND uses=0", roomID)
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

func (s *Store) PurgeUsedOrRevokedInvitesInRoom(roomID string) (int64, error) {
	res, err := s.DB.Exec("DELETE FROM invites WHERE room_id=? AND (revoked=1 OR uses >= max_uses)", roomID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
