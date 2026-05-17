package main

import (
	"regexp"
	"strings"
)

var emoticonMap = map[string]string{
	":)":         "😊",
	":-)":        "😊",
	":D":         "😄",
	":-D":        "😄",
	":(":         "🙁",
	":-(":        "🙁",
	";)":         "😉",
	";-)":        "😉",
	":P":         "😛",
	":-P":        "😛",
	":p":         "😛",
	":-p":        "😛",
	":O":         "😮",
	":-O":        "😮",
	":o":         "😮",
	":-o":        "😮",
	":|":         "😐",
	":-|":        "😐",
	"<3":         "❤",
	":fire:":     "🔥",
	":lock:":     "🔒",
	":thumbsup:": "👍",
	":100:":      "💯",
}

func convertEmoticons(text string) string {
	out := text
	for code, emoji := range emoticonMap {
		pattern := regexp.MustCompile(`(^|\s)` + regexp.QuoteMeta(code) + `($|\s)`)
		out = pattern.ReplaceAllStringFunc(out, func(match string) string {
			prefix := ""
			suffix := ""
			if strings.HasPrefix(match, " ") || strings.HasPrefix(match, "\t") || strings.HasPrefix(match, "\n") {
				prefix = match[:1]
			}
			if strings.HasSuffix(match, " ") || strings.HasSuffix(match, "\t") || strings.HasSuffix(match, "\n") {
				suffix = match[len(match)-1:]
			}
			return prefix + emoji + suffix
		})
	}
	return out
}

func terminalSafeText(text string) string {
	text = strings.ReplaceAll(text, "❤️", "❤")
	text = strings.ReplaceAll(text, "♥️", "♥")
	return text
}
