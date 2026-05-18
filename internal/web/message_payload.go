package web

import (
	"strconv"

	"veil/internal/db"
)

func outboundMessageData(msg *db.Message, clientMsgID string) map[string]string {
	return map[string]string{
		"id":            msg.ID,
		"row_id":        strconv.FormatInt(msg.RowID, 10),
		"sender_id":     msg.SenderID,
		"created_at":    msg.CreatedAt,
		"display_name":  msg.DisplayName,
		"ciphertext":    msg.Ciphertext,
		"nonce":         msg.Nonce,
		"reply_to_id":   msg.ReplyToID,
		"edited_at":     msg.EditedAt,
		"deleted_at":    msg.DeletedAt,
		"client_msg_id": clientMsgID,
	}
}
