package web

import (
	"strconv"

	"veil/internal/db"
)

func outboundMessageData(msg *db.Message, clientMsgID string) map[string]string {
	return map[string]string{
		"id":                 msg.ID,
		"row_id":             strconv.FormatInt(msg.RowID, 10),
		"sender_id":          msg.SenderID,
		"created_at":         msg.CreatedAt,
		"display_name":       msg.DisplayName,
		"chat_color":         msg.ChatColor,
		"avatar_url":         msg.AvatarURL,
		"avatar_ring_color":  msg.AvatarRingColor,
		"avatar_ring_color2": msg.AvatarRingColor2,
		"avatar_ring_color3": msg.AvatarRingColor3,
		"avatar_ring_color4": msg.AvatarRingColor4,
		"avatar_ring_mode":   msg.AvatarRingMode,
		"ciphertext":         msg.Ciphertext,
		"nonce":              msg.Nonce,
		"reply_to_id":        msg.ReplyToID,
		"edited_at":          msg.EditedAt,
		"deleted_at":         msg.DeletedAt,
		"deleted_by_id":      msg.DeletedByID,
		"deleted_by_name":    msg.DeletedByName,
		"client_msg_id":      clientMsgID,
	}
}
