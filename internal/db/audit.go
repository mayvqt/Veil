package db

func (s *Store) AddAdminAudit(actorID, actorName, action, target, details string) error {
	_, err := s.DB.Exec("INSERT INTO admin_audit (actor_id, actor_name, action, target, details, created_at) VALUES (?, ?, ?, ?, ?, ?)", actorID, actorName, action, target, details, now())
	return err
}

func (s *Store) ListAdminAudit(limit int) ([]map[string]string, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.DB.Query("SELECT actor_id, actor_name, action, target, details, created_at FROM admin_audit ORDER BY id DESC LIMIT ?", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]string, 0, limit)
	for rows.Next() {
		var actorID, actorName, action, target, details, createdAt string
		if err := rows.Scan(&actorID, &actorName, &action, &target, &details, &createdAt); err != nil {
			return nil, err
		}
		out = append(out, map[string]string{
			"actor_id":   actorID,
			"actor_name": actorName,
			"action":     action,
			"target":     target,
			"details":    details,
			"created_at": createdAt,
		})
	}
	return out, rows.Err()
}
