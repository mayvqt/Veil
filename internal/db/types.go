package db

const DefaultRoomStatusText = "encrypted room"
const DefaultRoomID = "main"

type RoomInfo struct {
	ID         string `json:"room_id"`
	Name       string `json:"room_name"`
	StatusText string `json:"room_status_text"`
}

type Room struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	StatusText  string `json:"status_text"`
	UnreadCount int64  `json:"unread_count"`
}

type User struct {
	ID               string `json:"id"`
	DisplayName      string `json:"display_name"`
	Role             string `json:"role"`
	ChatColor        string `json:"chat_color"`
	AvatarURL        string `json:"avatar_url"`
	AvatarRingColor  string `json:"avatar_ring_color"`
	AvatarRingColor2 string `json:"avatar_ring_color2"`
	AvatarRingColor3 string `json:"avatar_ring_color3"`
	AvatarRingColor4 string `json:"avatar_ring_color4"`
	AvatarRingMode   string `json:"avatar_ring_mode"`
}

type Message struct {
	ID               string `json:"id"`
	RowID            int64  `json:"row_id"`
	SenderID         string `json:"sender_id"`
	DisplayName      string `json:"display_name"`
	ChatColor        string `json:"chat_color"`
	AvatarURL        string `json:"avatar_url"`
	AvatarRingColor  string `json:"avatar_ring_color"`
	AvatarRingColor2 string `json:"avatar_ring_color2"`
	AvatarRingColor3 string `json:"avatar_ring_color3"`
	AvatarRingColor4 string `json:"avatar_ring_color4"`
	AvatarRingMode   string `json:"avatar_ring_mode"`
	Ciphertext       string `json:"ciphertext"`
	Nonce            string `json:"nonce"`
	ReplyToID        string `json:"reply_to_id"`
	EditedAt         string `json:"edited_at"`
	DeletedAt        string `json:"deleted_at"`
	CreatedAt        string `json:"created_at"`
}

type ReactionAuthor struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
}

type MessageReactions struct {
	Counts  map[string]map[string]int              `json:"counts"`
	Mine    map[string]map[string]bool             `json:"mine"`
	Authors map[string]map[string][]ReactionAuthor `json:"authors"`
}

type InviteInfo struct {
	ID        string `json:"id"`
	RoomID    string `json:"room_id"`
	ExpiresAt string `json:"expires_at"`
	MaxUses   int    `json:"max_uses"`
	Uses      int    `json:"uses"`
	Revoked   bool   `json:"revoked"`
	CreatedAt string `json:"created_at"`
}

type InviteMatch struct {
	ID     string
	RoomID string
}
