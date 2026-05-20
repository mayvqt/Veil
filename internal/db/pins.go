package db

func (s *Store) SetMessagePinned(roomID, messageID, actorUserID string, pinned bool) error {
	if pinned {
		_, err := s.DB.Exec("INSERT INTO pinned_messages (message_id, room_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?) ON CONFLICT(message_id) DO UPDATE SET room_id=excluded.room_id, pinned_by=excluded.pinned_by, pinned_at=excluded.pinned_at", messageID, roomID, actorUserID, now())
		return err
	}
	_, err := s.DB.Exec("DELETE FROM pinned_messages WHERE message_id=? AND room_id=?", messageID, roomID)
	return err
}

func (s *Store) ListPinnedMessageIDs(roomID string, limit int) ([]string, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.DB.Query("SELECT message_id FROM pinned_messages WHERE room_id=? ORDER BY pinned_at DESC LIMIT ?", roomID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0, limit)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
