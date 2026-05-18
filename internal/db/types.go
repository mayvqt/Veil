package db

type User struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	ChatColor   string `json:"chat_color"`
	AvatarURL   string `json:"avatar_url"`
}

type Message struct {
	ID          string `json:"id"`
	RowID       int64  `json:"row_id"`
	SenderID    string `json:"sender_id"`
	DisplayName string `json:"display_name"`
	ChatColor   string `json:"chat_color"`
	AvatarURL   string `json:"avatar_url"`
	Ciphertext  string `json:"ciphertext"`
	Nonce       string `json:"nonce"`
	ReplyToID   string `json:"reply_to_id"`
	EditedAt    string `json:"edited_at"`
	DeletedAt   string `json:"deleted_at"`
	CreatedAt   string `json:"created_at"`
}

type InviteInfo struct {
	ID        string `json:"id"`
	ExpiresAt string `json:"expires_at"`
	MaxUses   int    `json:"max_uses"`
	Uses      int    `json:"uses"`
	Revoked   bool   `json:"revoked"`
	CreatedAt string `json:"created_at"`
}
