package db

import "strconv"

func itoa(v int) string { return strconv.Itoa(v) }

func (s *Store) PruneMessagesOlderThan(days int) error {
	if days <= 0 {
		return nil
	}
	_, err := s.DB.Exec("DELETE FROM messages WHERE datetime(created_at) < datetime('now', ?)", "-"+strconv.Itoa(days)+" days")
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

func (s *Store) MessageCount() (int, error) {
	var c int
	err := s.DB.QueryRow("SELECT COUNT(*) FROM messages").Scan(&c)
	return c, err
}

func (s *Store) DeleteAllMessages() (int64, error) {
	res, err := s.DB.Exec("DELETE FROM messages")
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
