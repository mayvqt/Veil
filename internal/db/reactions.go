package db

import "strings"

func (s *Store) ToggleMessageReaction(messageID, userID, emoji string) (int, bool, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()

	var existing int
	if err := tx.QueryRow("SELECT COUNT(*) FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?", messageID, userID, emoji).Scan(&existing); err != nil {
		return 0, false, err
	}
	active := false
	if existing > 0 {
		if _, err := tx.Exec("DELETE FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?", messageID, userID, emoji); err != nil {
			return 0, false, err
		}
	} else {
		if _, err := tx.Exec("INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)", messageID, userID, emoji, now()); err != nil {
			return 0, false, err
		}
		active = true
	}
	var count int
	if err := tx.QueryRow("SELECT COUNT(*) FROM message_reactions WHERE message_id=? AND emoji=?", messageID, emoji).Scan(&count); err != nil {
		return 0, false, err
	}
	if err := tx.Commit(); err != nil {
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

func (s *Store) ListMessageReactions(messageIDs []string, viewerUserID string) (MessageReactions, error) {
	reactions := MessageReactions{
		Counts:  map[string]map[string]int{},
		Mine:    map[string]map[string]bool{},
		Authors: map[string]map[string][]ReactionAuthor{},
	}
	if len(messageIDs) == 0 {
		return reactions, nil
	}
	placeholders := strings.Repeat("?,", len(messageIDs))
	placeholders = placeholders[:len(placeholders)-1]
	args := make([]any, 0, len(messageIDs))
	for _, id := range messageIDs {
		args = append(args, id)
	}
	rows, err := s.DB.Query("SELECT r.message_id, r.emoji, r.user_id, u.display_name FROM message_reactions r JOIN users u ON u.id = r.user_id WHERE r.message_id IN ("+placeholders+") ORDER BY r.created_at ASC, u.display_name COLLATE NOCASE ASC", args...)
	if err != nil {
		return MessageReactions{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var messageID, emoji string
		var author ReactionAuthor
		if err := rows.Scan(&messageID, &emoji, &author.UserID, &author.DisplayName); err != nil {
			return MessageReactions{}, err
		}
		if reactions.Counts[messageID] == nil {
			reactions.Counts[messageID] = map[string]int{}
		}
		reactions.Counts[messageID][emoji]++
		if reactions.Authors[messageID] == nil {
			reactions.Authors[messageID] = map[string][]ReactionAuthor{}
		}
		reactions.Authors[messageID][emoji] = append(reactions.Authors[messageID][emoji], author)
		if author.UserID == viewerUserID {
			if reactions.Mine[messageID] == nil {
				reactions.Mine[messageID] = map[string]bool{}
			}
			reactions.Mine[messageID][emoji] = true
		}
	}
	return reactions, rows.Err()
}
