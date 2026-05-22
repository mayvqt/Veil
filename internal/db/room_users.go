package db

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

func (s *Store) IsInitialized() (bool, error) {
	var initialized int
	err := s.DB.QueryRow("SELECT initialized FROM room_state WHERE id=1").Scan(&initialized)
	return initialized == 1, err
}

func normalizeRoomID(value string) string {
	v := strings.TrimSpace(strings.ToLower(value))
	if v == "" {
		return ""
	}
	out := make([]rune, 0, len(v))
	for _, r := range v {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		return ""
	}
	return string(out)
}

func baseRoomIDFromName(value string) string {
	v := strings.TrimSpace(strings.ToLower(value))
	out := make([]rune, 0, len(v))
	lastDash := false
	for _, r := range v {
		valid := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if valid {
			out = append(out, r)
			lastDash = false
			continue
		}
		if !lastDash && len(out) > 0 {
			out = append(out, '-')
			lastDash = true
		}
	}
	for len(out) > 0 && out[len(out)-1] == '-' {
		out = out[:len(out)-1]
	}
	if len(out) == 0 {
		return "room"
	}
	if len(out) > 32 {
		out = out[:32]
		for len(out) > 0 && out[len(out)-1] == '-' {
			out = out[:len(out)-1]
		}
	}
	return string(out)
}

func randomRoomIDDigits() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(90000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%08d", n.Int64()+10000000), nil
}

func uniqueRoomID(tx *sql.Tx, roomName string) (string, error) {
	base := baseRoomIDFromName(roomName)
	if len(base) > 39 {
		base = base[:39]
	}
	for range 20 {
		digits, err := randomRoomIDDigits()
		if err != nil {
			return "", err
		}
		id := normalizeRoomID(base + digits)
		var count int
		if err := tx.QueryRow("SELECT COUNT(*) FROM rooms WHERE id=?", id).Scan(&count); err != nil {
			return "", err
		}
		if count == 0 {
			return id, nil
		}
	}
	return "", errors.New("failed to generate unique room id")
}

func (s *Store) CreateRoom(roomID, roomName, statusText, actorUserID string) (Room, error) {
	name := strings.TrimSpace(roomName)
	if name == "" {
		return Room{}, errors.New("room name required")
	}
	if statusText == "" {
		statusText = DefaultRoomStatusText
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return Room{}, err
	}
	defer tx.Rollback()
	id := normalizeRoomID(roomID)
	if id == "" {
		var err error
		id, err = uniqueRoomID(tx, name)
		if err != nil {
			return Room{}, err
		}
	}
	if len(id) > 48 {
		return Room{}, errors.New("room id too long")
	}
	var sortOrder int
	if err := tx.QueryRow("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM rooms").Scan(&sortOrder); err != nil {
		return Room{}, err
	}
	if _, err := tx.Exec("INSERT INTO rooms (id, name, status_text, sort_order, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, name, statusText, sortOrder, actorUserID, now()); err != nil {
		return Room{}, err
	}
	if _, err := tx.Exec(`
INSERT OR IGNORE INTO room_memberships (room_id, user_id, joined_at)
SELECT ?, id, ? FROM users WHERE active=1`, id, now()); err != nil {
		return Room{}, err
	}
	if err := tx.Commit(); err != nil {
		return Room{}, err
	}
	return Room{ID: id, Name: name, StatusText: statusText, SortOrder: sortOrder}, nil
}

func (s *Store) DeleteRoom(roomID string) error {
	if roomID == DefaultRoomID {
		return errors.New("cannot delete default room")
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE room_id=?)", roomID); err != nil {
		return err
	}
	for _, stmt := range []string{
		"DELETE FROM pinned_messages WHERE room_id=?",
		"DELETE FROM message_receipts_v2 WHERE room_id=?",
		"DELETE FROM room_roles WHERE room_id=?",
		"DELETE FROM room_memberships WHERE room_id=?",
		"DELETE FROM invites WHERE room_id=?",
		"DELETE FROM messages WHERE room_id=?",
		"DELETE FROM rooms WHERE id=?",
	} {
		if _, err := tx.Exec(stmt, roomID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) AddUserToRoom(roomID, userID string) error {
	_, err := s.DB.Exec("INSERT OR IGNORE INTO room_memberships (room_id, user_id, joined_at) VALUES (?, ?, ?)", roomID, userID, now())
	return err
}

func (s *Store) AddUserToAllRooms(userID string) error {
	_, err := s.DB.Exec(`
INSERT OR IGNORE INTO room_memberships (room_id, user_id, joined_at)
SELECT id, ?, ? FROM rooms`, userID, now())
	return err
}

func (s *Store) SetRoomRole(roomID, userID, role string) error {
	_, err := s.DB.Exec("INSERT INTO room_roles (room_id, user_id, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET role=excluded.role", roomID, userID, role, now())
	return err
}

func (s *Store) ClearRoomRole(roomID, userID string) error {
	_, err := s.DB.Exec("DELETE FROM room_roles WHERE room_id=? AND user_id=?", roomID, userID)
	return err
}

func (s *Store) GetRoomRole(roomID, userID string) (string, error) {
	var role string
	err := s.DB.QueryRow("SELECT role FROM room_roles WHERE room_id=? AND user_id=?", roomID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return role, err
}

func (s *Store) RoomExists(roomID string) (bool, error) {
	var c int
	if err := s.DB.QueryRow("SELECT COUNT(*) FROM rooms WHERE id=?", roomID).Scan(&c); err != nil {
		return false, err
	}
	return c > 0, nil
}

func (s *Store) GetRoomName() (string, error) {
	var roomName string
	err := s.DB.QueryRow("SELECT COALESCE(room_name,'') FROM room_state WHERE id=1").Scan(&roomName)
	return roomName, err
}

func (s *Store) GetRoomInfo() (RoomInfo, error) {
	return s.GetRoomInfoByID(DefaultRoomID)
}

func (s *Store) SetRoomName(roomName string) error {
	return s.SetRoomNameByID(DefaultRoomID, roomName)
}

func (s *Store) GetRoomInfoByID(roomID string) (RoomInfo, error) {
	var info RoomInfo
	info.ID = roomID
	err := s.DB.QueryRow("SELECT id, name, COALESCE(status_text,?) FROM rooms WHERE id=?", DefaultRoomStatusText, roomID).Scan(&info.ID, &info.Name, &info.StatusText)
	return info, err
}

func (s *Store) SetRoomNameByID(roomID, roomName string) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("UPDATE rooms SET name=? WHERE id=?", roomName, roomID); err != nil {
		return err
	}
	if roomID == DefaultRoomID {
		if _, err := tx.Exec("UPDATE room_state SET room_name=? WHERE id=1", roomName); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) GetRoomStatusText() (string, error) {
	return s.GetRoomStatusTextByID(DefaultRoomID)
}

func (s *Store) GetRoomStatusTextByID(roomID string) (string, error) {
	var statusText string
	err := s.DB.QueryRow("SELECT COALESCE(status_text,?) FROM rooms WHERE id=?", DefaultRoomStatusText, roomID).Scan(&statusText)
	return statusText, err
}

func (s *Store) SetRoomStatusText(statusText string) error {
	return s.SetRoomStatusTextByID(DefaultRoomID, statusText)
}

func (s *Store) SetRoomStatusTextByID(roomID, statusText string) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("UPDATE rooms SET status_text=? WHERE id=?", statusText, roomID); err != nil {
		return err
	}
	if roomID == DefaultRoomID {
		if _, err := tx.Exec("UPDATE room_state SET room_status_text=? WHERE id=1", statusText); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) UserCount() (int, error) {
	var c int
	err := s.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&c)
	return c, err
}

func optionalString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return strings.TrimSpace(values[0])
}

func (s *Store) InitRoom(roomName, displayName, publicKey, credentialID, roomKeyEnc string, deviceSecretHash ...string) (*User, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var count int
	if err := tx.QueryRow("SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, errors.New("room already initialized")
	}

	u := &User{ID: uuid.NewString(), DisplayName: displayName, Role: "root_admin"}
	u.ChatColor = defaultChatColorForUserID(u.ID)
	if _, err := tx.Exec("INSERT INTO users (id, display_name, role, chat_color, created_at) VALUES (?, ?, ?, ?, ?)", u.ID, u.DisplayName, u.Role, u.ChatColor, now()); err != nil {
		return nil, err
	}
	if _, err := tx.Exec("INSERT INTO devices (id, user_id, public_key, credential_id, device_secret_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)", uuid.NewString(), u.ID, publicKey, credentialID, optionalString(deviceSecretHash), now()); err != nil {
		return nil, err
	}
	if _, err := tx.Exec("UPDATE room_state SET room_name=?, initialized=1, room_key_enc=?, created_at=? WHERE id=1", roomName, roomKeyEnc, now()); err != nil {
		return nil, err
	}
	if _, err := tx.Exec("INSERT OR IGNORE INTO rooms (id, name, status_text, created_by, created_at) VALUES (?, ?, ?, ?, ?)", DefaultRoomID, roomName, DefaultRoomStatusText, u.ID, now()); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`
INSERT OR IGNORE INTO room_memberships (room_id, user_id, joined_at)
SELECT id, ?, ? FROM rooms`, u.ID, now()); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) AddMember(displayName, publicKey, credentialID string, deviceSecretHash ...string) (*User, error) {
	u := &User{ID: uuid.NewString(), DisplayName: displayName, Role: "member"}
	u.ChatColor = defaultChatColorForUserID(u.ID)
	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("INSERT INTO users (id, display_name, role, chat_color, created_at) VALUES (?, ?, ?, ?, ?)", u.ID, u.DisplayName, u.Role, u.ChatColor, now()); err != nil {
		return nil, err
	}
	if _, err := tx.Exec("INSERT INTO devices (id, user_id, public_key, credential_id, device_secret_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)", uuid.NewString(), u.ID, publicKey, credentialID, optionalString(deviceSecretHash), now()); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`
INSERT OR IGNORE INTO room_memberships (room_id, user_id, joined_at)
SELECT id, ?, ? FROM rooms`, u.ID, now()); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) FindUserByCredential(credentialID string) (*User, error) {
	row := s.DB.QueryRow(`
SELECT u.id, u.display_name, u.role, COALESCE(u.status_text,''), u.chat_color, COALESCE(u.avatar_url,''), COALESCE(u.avatar_ring_color,''), COALESCE(u.avatar_ring_color2,''), COALESCE(u.avatar_ring_color3,''), COALESCE(u.avatar_ring_color4,''), COALESCE(u.avatar_ring_mode,'none'), COALESCE(u.profile_about,''), COALESCE(u.profile_accent,''), COALESCE(u.profile_banner_url,''), COALESCE(u.profile_card_bg_url,''), COALESCE(u.profile_banner_opacity,100), COALESCE(u.profile_card_bg_opacity,100)
FROM users u JOIN devices d ON d.user_id=u.id
WHERE d.credential_id=? AND u.active=1 LIMIT 1`, credentialID)
	u := &User{}
	if err := row.Scan(&u.ID, &u.DisplayName, &u.Role, &u.StatusText, &u.ChatColor, &u.AvatarURL, &u.AvatarRingColor, &u.AvatarRingColor2, &u.AvatarRingColor3, &u.AvatarRingColor4, &u.AvatarRingMode, &u.ProfileAbout, &u.ProfileAccent, &u.ProfileBannerURL, &u.ProfileCardBgURL, &u.ProfileBannerOpacity, &u.ProfileCardBgOpacity); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return u, nil
}

func (s *Store) FindUserByCredentialSecret(credentialID, deviceSecretHash string) (*User, error) {
	row := s.DB.QueryRow(`
SELECT u.id, u.display_name, u.role, COALESCE(u.status_text,''), u.chat_color, COALESCE(u.avatar_url,''), COALESCE(u.avatar_ring_color,''), COALESCE(u.avatar_ring_color2,''), COALESCE(u.avatar_ring_color3,''), COALESCE(u.avatar_ring_color4,''), COALESCE(u.avatar_ring_mode,'none'), COALESCE(u.profile_about,''), COALESCE(u.profile_accent,''), COALESCE(u.profile_banner_url,''), COALESCE(u.profile_card_bg_url,''), COALESCE(u.profile_banner_opacity,100), COALESCE(u.profile_card_bg_opacity,100)
FROM users u JOIN devices d ON d.user_id=u.id
WHERE d.credential_id=? AND u.active=1 AND (
  COALESCE(d.device_secret_hash,'')='' OR d.device_secret_hash=?
)
LIMIT 1`, credentialID, deviceSecretHash)
	u := &User{}
	if err := row.Scan(&u.ID, &u.DisplayName, &u.Role, &u.StatusText, &u.ChatColor, &u.AvatarURL, &u.AvatarRingColor, &u.AvatarRingColor2, &u.AvatarRingColor3, &u.AvatarRingColor4, &u.AvatarRingMode, &u.ProfileAbout, &u.ProfileAccent, &u.ProfileBannerURL, &u.ProfileCardBgURL, &u.ProfileBannerOpacity, &u.ProfileCardBgOpacity); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return u, nil
}

func (s *Store) GetActiveUser(userID string) (*User, error) {
	row := s.DB.QueryRow(`
SELECT id, display_name, role, COALESCE(status_text,''), chat_color, COALESCE(avatar_url,''), COALESCE(avatar_ring_color,''), COALESCE(avatar_ring_color2,''), COALESCE(avatar_ring_color3,''), COALESCE(avatar_ring_color4,''), COALESCE(avatar_ring_mode,'none'), COALESCE(profile_about,''), COALESCE(profile_accent,''), COALESCE(profile_banner_url,''), COALESCE(profile_card_bg_url,''), COALESCE(profile_banner_opacity,100), COALESCE(profile_card_bg_opacity,100)
FROM users
WHERE id=? AND active=1`, userID)
	u := &User{}
	if err := row.Scan(&u.ID, &u.DisplayName, &u.Role, &u.StatusText, &u.ChatColor, &u.AvatarURL, &u.AvatarRingColor, &u.AvatarRingColor2, &u.AvatarRingColor3, &u.AvatarRingColor4, &u.AvatarRingMode, &u.ProfileAbout, &u.ProfileAccent, &u.ProfileBannerURL, &u.ProfileCardBgURL, &u.ProfileBannerOpacity, &u.ProfileCardBgOpacity); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return u, nil
}

func (s *Store) ListUsers() ([]User, error) {
	rows, err := s.DB.Query("SELECT id, display_name, role, COALESCE(status_text,''), chat_color, COALESCE(avatar_url,''), COALESCE(avatar_ring_color,''), COALESCE(avatar_ring_color2,''), COALESCE(avatar_ring_color3,''), COALESCE(avatar_ring_color4,''), COALESCE(avatar_ring_mode,'none'), COALESCE(profile_about,''), COALESCE(profile_accent,''), COALESCE(profile_banner_url,''), COALESCE(profile_card_bg_url,''), COALESCE(profile_banner_opacity,100), COALESCE(profile_card_bg_opacity,100) FROM users WHERE active=1 ORDER BY created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.DisplayName, &u.Role, &u.StatusText, &u.ChatColor, &u.AvatarURL, &u.AvatarRingColor, &u.AvatarRingColor2, &u.AvatarRingColor3, &u.AvatarRingColor4, &u.AvatarRingMode, &u.ProfileAbout, &u.ProfileAccent, &u.ProfileBannerURL, &u.ProfileCardBgURL, &u.ProfileBannerOpacity, &u.ProfileCardBgOpacity); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *Store) ListUsersByRoom(roomID string) ([]User, error) {
	rows, err := s.DB.Query(`
SELECT u.id, u.display_name, u.role, COALESCE(rr.role,''), COALESCE(u.status_text,''), u.chat_color, COALESCE(u.avatar_url,''), COALESCE(u.avatar_ring_color,''), COALESCE(u.avatar_ring_color2,''), COALESCE(u.avatar_ring_color3,''), COALESCE(u.avatar_ring_color4,''), COALESCE(u.avatar_ring_mode,'none'), COALESCE(u.profile_about,''), COALESCE(u.profile_accent,''), COALESCE(u.profile_banner_url,''), COALESCE(u.profile_card_bg_url,''), COALESCE(u.profile_banner_opacity,100), COALESCE(u.profile_card_bg_opacity,100)
FROM users u
JOIN room_memberships rm ON rm.user_id=u.id
LEFT JOIN room_roles rr ON rr.room_id=rm.room_id AND rr.user_id=u.id
WHERE rm.room_id=? AND u.active=1
ORDER BY rm.joined_at ASC`, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.DisplayName, &u.Role, &u.RoomRole, &u.StatusText, &u.ChatColor, &u.AvatarURL, &u.AvatarRingColor, &u.AvatarRingColor2, &u.AvatarRingColor3, &u.AvatarRingColor4, &u.AvatarRingMode, &u.ProfileAbout, &u.ProfileAccent, &u.ProfileBannerURL, &u.ProfileCardBgURL, &u.ProfileBannerOpacity, &u.ProfileCardBgOpacity); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *Store) IsRoomMember(roomID, userID string) (bool, error) {
	var exists int
	if err := s.DB.QueryRow("SELECT 1 FROM room_memberships WHERE room_id=? AND user_id=? LIMIT 1", roomID, userID).Scan(&exists); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (s *Store) ListRoomsForUser(userID string) ([]Room, error) {
	rows, err := s.DB.Query(`
SELECT r.id, r.name, COALESCE(r.status_text, ?), COALESCE(r.pinned, 0), COALESCE(r.sort_order, 0),
(
  SELECT COUNT(*)
  FROM messages m
  WHERE m.room_id=r.id
    AND m.rowid > COALESCE(rc.last_seen_rowid, 0)
    AND m.sender_id <> rm.user_id
) AS unread_count
FROM rooms r
JOIN room_memberships rm ON rm.room_id=r.id
LEFT JOIN message_receipts_v2 rc ON rc.room_id=r.id AND rc.user_id=rm.user_id
WHERE rm.user_id=?
ORDER BY r.pinned DESC, r.sort_order ASC, rm.joined_at ASC`, DefaultRoomStatusText, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rooms := make([]Room, 0)
	for rows.Next() {
		var room Room
		var pinned int
		if err := rows.Scan(&room.ID, &room.Name, &room.StatusText, &pinned, &room.SortOrder, &room.UnreadCount); err != nil {
			return nil, err
		}
		room.Pinned = pinned == 1
		rooms = append(rooms, room)
	}
	return rooms, rows.Err()
}

func (s *Store) UpdateUserRole(userID, role string) error {
	_, err := s.DB.Exec("UPDATE users SET role=? WHERE id=? AND active=1", role, userID)
	return err
}

func (s *Store) DeactivateUser(userID string) error {
	_, err := s.DB.Exec("UPDATE users SET active=0 WHERE id=?", userID)
	return err
}

func (s *Store) GetRoomKeyEnc() (string, error) {
	var roomKeyEnc string
	if err := s.DB.QueryRow("SELECT room_key_enc FROM room_state WHERE id=1").Scan(&roomKeyEnc); err != nil {
		return "", err
	}
	return roomKeyEnc, nil
}

func (s *Store) IsUserActive(userID string) (bool, error) {
	var active int
	if err := s.DB.QueryRow("SELECT active FROM users WHERE id=?", userID).Scan(&active); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return active == 1, nil
}

var hexColorPattern = regexp.MustCompile(`^#[0-9a-f]{6}$`)

func (s *Store) SetUserChatColor(userID, chatColor string) error {
	if !hexColorPattern.MatchString(chatColor) {
		return errors.New("invalid color")
	}
	_, err := s.DB.Exec("UPDATE users SET chat_color=? WHERE id=? AND active=1", chatColor, userID)
	return err
}

func (s *Store) SetUserDisplayName(userID, displayName string) error {
	name := strings.TrimSpace(displayName)
	if name == "" {
		return errors.New("display name required")
	}
	_, err := s.DB.Exec("UPDATE users SET display_name=? WHERE id=? AND active=1", name, userID)
	return err
}

func (s *Store) SetUserStatusText(userID, statusText string) error {
	status := strings.TrimSpace(statusText)
	_, err := s.DB.Exec("UPDATE users SET status_text=? WHERE id=? AND active=1", status, userID)
	return err
}

func (s *Store) SetUserProfileCard(userID, about, accent, bannerURL, cardBgURL string, bannerOpacity, cardBgOpacity int) error {
	_, err := s.DB.Exec("UPDATE users SET profile_about=?, profile_accent=?, profile_banner_url=?, profile_card_bg_url=?, profile_banner_opacity=?, profile_card_bg_opacity=? WHERE id=? AND active=1", strings.TrimSpace(about), strings.TrimSpace(accent), strings.TrimSpace(bannerURL), strings.TrimSpace(cardBgURL), bannerOpacity, cardBgOpacity, userID)
	return err
}

func (s *Store) SetRoomPinned(roomID string, pinned bool) error {
	value := 0
	if pinned {
		value = 1
	}
	_, err := s.DB.Exec("UPDATE rooms SET pinned=? WHERE id=?", value, roomID)
	return err
}

func (s *Store) MoveRoom(roomID string, direction int) error {
	if direction == 0 {
		return nil
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var pinned, sortOrder int
	if err := tx.QueryRow("SELECT pinned, sort_order FROM rooms WHERE id=?", roomID).Scan(&pinned, &sortOrder); err != nil {
		return err
	}
	var otherID string
	var otherOrder int
	query := "SELECT id, sort_order FROM rooms WHERE pinned=? AND sort_order < ? ORDER BY sort_order DESC LIMIT 1"
	if direction > 0 {
		query = "SELECT id, sort_order FROM rooms WHERE pinned=? AND sort_order > ? ORDER BY sort_order ASC LIMIT 1"
	}
	err = tx.QueryRow(query, pinned, sortOrder).Scan(&otherID, &otherOrder)
	if errors.Is(err, sql.ErrNoRows) {
		return tx.Commit()
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE rooms SET sort_order=? WHERE id=?", otherOrder, roomID); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE rooms SET sort_order=? WHERE id=?", sortOrder, otherID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) SetUserAvatarURL(userID, avatarURL string) error {
	_, err := s.DB.Exec("UPDATE users SET avatar_url=? WHERE id=? AND active=1", avatarURL, userID)
	return err
}

func (s *Store) SetUserAvatarRing(userID, ringColor, ringColor2, ringColor3, ringColor4, ringMode string) error {
	_, err := s.DB.Exec("UPDATE users SET avatar_ring_color=?, avatar_ring_color2=?, avatar_ring_color3=?, avatar_ring_color4=?, avatar_ring_mode=? WHERE id=? AND active=1", ringColor, ringColor2, ringColor3, ringColor4, ringMode, userID)
	return err
}

func (s *Store) GetUserAvatarURL(userID string) (string, error) {
	var avatarURL string
	if err := s.DB.QueryRow("SELECT COALESCE(avatar_url,'') FROM users WHERE id=?", userID).Scan(&avatarURL); err != nil {
		return "", err
	}
	return avatarURL, nil
}

func (s *Store) GetUserProfileMedia(userID string) (string, string, int, int, error) {
	var bannerURL, cardBgURL string
	var bannerOpacity, cardBgOpacity int
	if err := s.DB.QueryRow("SELECT COALESCE(profile_banner_url,''), COALESCE(profile_card_bg_url,''), COALESCE(profile_banner_opacity,100), COALESCE(profile_card_bg_opacity,100) FROM users WHERE id=?", userID).Scan(&bannerURL, &cardBgURL, &bannerOpacity, &cardBgOpacity); err != nil {
		return "", "", 100, 100, err
	}
	return bannerURL, cardBgURL, bannerOpacity, cardBgOpacity, nil
}

func (s *Store) ClearUserAvatarURL(userID string) error {
	_, err := s.DB.Exec("UPDATE users SET avatar_url='' WHERE id=?", userID)
	return err
}

func (s *Store) ListActiveAvatarURLs() ([]string, error) {
	rows, err := s.DB.Query(`
SELECT COALESCE(avatar_url,'') FROM users WHERE active=1 AND TRIM(COALESCE(avatar_url,''))<>''
UNION ALL
SELECT COALESCE(profile_banner_url,'') FROM users WHERE active=1 AND TRIM(COALESCE(profile_banner_url,''))<>''
UNION ALL
SELECT COALESCE(profile_card_bg_url,'') FROM users WHERE active=1 AND TRIM(COALESCE(profile_card_bg_url,''))<>''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var url string
		if err := rows.Scan(&url); err != nil {
			return nil, err
		}
		out = append(out, url)
	}
	return out, rows.Err()
}

func defaultChatColorForUserID(userID string) string {
	n := fnv32aString(userID)
	hue := float64(n % 360)
	sat := 62.0 + float64((n>>8)%18)    // 62-79
	light := 46.0 + float64((n>>16)%12) // 46-57
	return hslToHex(hue, sat/100.0, light/100.0)
}

func fnv32aString(value string) uint32 {
	const (
		offset uint32 = 2166136261
		prime  uint32 = 16777619
	)
	hash := offset
	for i := 0; i < len(value); i++ {
		hash ^= uint32(value[i])
		hash *= prime
	}
	return hash
}

func hslToHex(h, s, l float64) string {
	c := (1 - absf(2*l-1)) * s
	x := c * (1 - absf(modf(h/60.0, 2)-1))
	m := l - c/2
	var r1, g1, b1 float64
	switch {
	case h < 60:
		r1, g1, b1 = c, x, 0
	case h < 120:
		r1, g1, b1 = x, c, 0
	case h < 180:
		r1, g1, b1 = 0, c, x
	case h < 240:
		r1, g1, b1 = 0, x, c
	case h < 300:
		r1, g1, b1 = x, 0, c
	default:
		r1, g1, b1 = c, 0, x
	}
	r := int((r1 + m) * 255)
	g := int((g1 + m) * 255)
	b := int((b1 + m) * 255)
	return fmt.Sprintf("#%02x%02x%02x", clamp8(r), clamp8(g), clamp8(b))
}

func absf(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

func modf(a, b float64) float64 {
	for a >= b {
		a -= b
	}
	return a
}

func clamp8(v int) int {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return v
}
