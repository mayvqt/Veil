package db

import (
	"database/sql"
	"errors"
	"fmt"
	"hash/fnv"
	"regexp"

	"github.com/google/uuid"
)

func (s *Store) IsInitialized() (bool, error) {
	var initialized int
	err := s.DB.QueryRow("SELECT initialized FROM room_state WHERE id=1").Scan(&initialized)
	return initialized == 1, err
}

func (s *Store) GetRoomName() (string, error) {
	var roomName string
	err := s.DB.QueryRow("SELECT room_name FROM room_state WHERE id=1").Scan(&roomName)
	return roomName, err
}

func (s *Store) UserCount() (int, error) {
	var c int
	err := s.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&c)
	return c, err
}

func (s *Store) InitRoom(roomName, displayName, publicKey, credentialID, roomKeyEnc string) (*User, error) {
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
	if _, err := tx.Exec("INSERT INTO devices (id, user_id, public_key, credential_id, created_at) VALUES (?, ?, ?, ?, ?)", uuid.NewString(), u.ID, publicKey, credentialID, now()); err != nil {
		return nil, err
	}
	if _, err := tx.Exec("UPDATE room_state SET room_name=?, initialized=1, room_key_enc=?, created_at=? WHERE id=1", roomName, roomKeyEnc, now()); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) AddMember(displayName, publicKey, credentialID string) (*User, error) {
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
	if _, err := tx.Exec("INSERT INTO devices (id, user_id, public_key, credential_id, created_at) VALUES (?, ?, ?, ?, ?)", uuid.NewString(), u.ID, publicKey, credentialID, now()); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) FindUserByCredential(credentialID string) (*User, error) {
	row := s.DB.QueryRow(`
SELECT u.id, u.display_name, u.role, u.chat_color
FROM users u JOIN devices d ON d.user_id=u.id
WHERE d.credential_id=? AND u.active=1 LIMIT 1`, credentialID)
	u := &User{}
	if err := row.Scan(&u.ID, &u.DisplayName, &u.Role, &u.ChatColor); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return u, nil
}

func (s *Store) ListUsers() ([]User, error) {
	rows, err := s.DB.Query("SELECT id, display_name, role, chat_color FROM users WHERE active=1 ORDER BY created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.DisplayName, &u.Role, &u.ChatColor); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
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

func defaultChatColorForUserID(userID string) string {
	h := fnv.New32a()
	_, _ = h.Write([]byte(userID))
	n := h.Sum32()
	hue := float64(n % 360)
	sat := 62.0 + float64((n>>8)%18)    // 62-79
	light := 46.0 + float64((n>>16)%12) // 46-57
	return hslToHex(hue, sat/100.0, light/100.0)
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
