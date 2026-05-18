package db

import "strings"

func (s *Store) ToggleMessageReaction(messageID, userID, emoji string) (int, bool, error) {
	var existing int
	if err := s.DB.QueryRow("SELECT COUNT(*) FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?", messageID, userID, emoji).Scan(&existing); err != nil {
		return 0, false, err
	}
	active := false
	if existing > 0 {
		if _, err := s.DB.Exec("DELETE FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?", messageID, userID, emoji); err != nil {
			return 0, false, err
		}
	} else {
		if _, err := s.DB.Exec("INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)", messageID, userID, emoji, now()); err != nil {
			return 0, false, err
		}
		active = true
	}
	var count int
	if err := s.DB.QueryRow("SELECT COUNT(*) FROM message_reactions WHERE message_id=? AND emoji=?", messageID, emoji).Scan(&count); err != nil {
		return 0, false, err
	}
	return count, active, nil
}

func (s *Store) MessageExists(messageID string) (bool, error) {
	var c int
	if err := s.DB.QueryRow("SELECT COUNT(*) FROM messages WHERE id=?", messageID).Scan(&c); err != nil {
		return false, err
	}
	return c > 0, nil
}

func (s *Store) ListMessageReactions(messageIDs []string, viewerUserID string) (map[string]map[string]int, map[string]map[string]bool, error) {
	counts := map[string]map[string]int{}
	mine := map[string]map[string]bool{}
	if len(messageIDs) == 0 {
		return counts, mine, nil
	}
	placeholders := strings.Repeat("?,", len(messageIDs))
	placeholders = placeholders[:len(placeholders)-1]
	args := make([]any, 0, len(messageIDs))
	for _, id := range messageIDs {
		args = append(args, id)
	}
	rows, err := s.DB.Query("SELECT message_id, emoji, COUNT(*) FROM message_reactions WHERE message_id IN ("+placeholders+") GROUP BY message_id, emoji", args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var messageID, emoji string
		var count int
		if err := rows.Scan(&messageID, &emoji, &count); err != nil {
			return nil, nil, err
		}
		if counts[messageID] == nil {
			counts[messageID] = map[string]int{}
		}
		counts[messageID][emoji] = count
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	rowsMine, err := s.DB.Query("SELECT message_id, emoji FROM message_reactions WHERE user_id=? AND message_id IN ("+placeholders+")", append([]any{viewerUserID}, args...)...)
	if err != nil {
		return nil, nil, err
	}
	defer rowsMine.Close()
	for rowsMine.Next() {
		var messageID, emoji string
		if err := rowsMine.Scan(&messageID, &emoji); err != nil {
			return nil, nil, err
		}
		if mine[messageID] == nil {
			mine[messageID] = map[string]bool{}
		}
		mine[messageID][emoji] = true
	}
	return counts, mine, rowsMine.Err()
}
