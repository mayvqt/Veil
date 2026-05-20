package db

import "strconv"

func (s *Store) PruneMessagesOlderThan(days int) error {
	if days <= 0 {
		return nil
	}
	_, err := s.DB.Exec("DELETE FROM messages WHERE datetime(created_at) < datetime('now', ?)", "-"+strconv.Itoa(days)+" days")
	return err
}

func (s *Store) PruneMessagesOlderThanInRoom(roomID string, days int) error {
	if days <= 0 {
		return nil
	}
	_, err := s.DB.Exec("DELETE FROM messages WHERE room_id=? AND datetime(created_at) < datetime('now', ?)", roomID, "-"+strconv.Itoa(days)+" days")
	return err
}

func (s *Store) PruneMessagesToLimit(limit int) error {
	if limit <= 0 {
		return nil
	}
	_, err := s.DB.Exec(`
DELETE FROM messages
WHERE id IN (
  SELECT id
  FROM messages
  ORDER BY datetime(created_at) DESC
  LIMIT -1 OFFSET ?
)`, limit)
	return err
}

func (s *Store) PruneMessagesToLimitInRoom(roomID string, limit int) error {
	if limit <= 0 {
		return nil
	}
	_, err := s.DB.Exec(`
DELETE FROM messages
WHERE room_id=? AND id IN (
  SELECT id
  FROM messages
  WHERE room_id=?
  ORDER BY datetime(created_at) DESC
  LIMIT -1 OFFSET ?
)`, roomID, roomID, limit)
	return err
}

func (s *Store) MessageCount() (int, error) {
	var c int
	err := s.DB.QueryRow("SELECT COUNT(*) FROM messages").Scan(&c)
	return c, err
}

func (s *Store) MessageCountInRoom(roomID string) (int, error) {
	var c int
	err := s.DB.QueryRow("SELECT COUNT(*) FROM messages WHERE room_id=?", roomID).Scan(&c)
	return c, err
}

func (s *Store) DeleteAllMessages() (int64, error) {
	res, err := s.DB.Exec("DELETE FROM messages")
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *Store) DeleteAllMessagesInRoom(roomID string) (int64, error) {
	res, err := s.DB.Exec("DELETE FROM messages WHERE room_id=?", roomID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
