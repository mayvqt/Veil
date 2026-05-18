package web

func (s *Server) trackPresenceConnect(userID string) bool {
	s.presenceMu.Lock()
	defer s.presenceMu.Unlock()
	s.presenceCounts[userID]++
	return s.presenceCounts[userID] == 1
}

func (s *Server) trackPresenceDisconnect(userID string) bool {
	s.presenceMu.Lock()
	defer s.presenceMu.Unlock()
	current := s.presenceCounts[userID]
	if current <= 1 {
		delete(s.presenceCounts, userID)
		return current > 0
	}
	s.presenceCounts[userID] = current - 1
	return false
}
