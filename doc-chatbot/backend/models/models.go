package models

import "time"

type ParseStatus string

const (
	ParseStatusDeferred ParseStatus = "deferred" // uploaded, parse not yet started
	ParseStatusPending  ParseStatus = "pending"
	ParseStatusReady    ParseStatus = "ready"
	ParseStatusFailed   ParseStatus = "failed"
)

type FileInfo struct {
	ID           string      `json:"id"`
	Name         string      `json:"name"`
	OriginalName string      `json:"originalName"`
	Size         int64       `json:"size"`
	MimeType     string      `json:"mimeType"`
	UploadedAt   time.Time   `json:"uploadedAt"`
	ParseStatus  ParseStatus `json:"parseStatus"`
	ParseError   *string     `json:"parseError"`
	ParseWarning *string     `json:"parseWarning"`
	ContentChars int         `json:"contentChars"`
	// Internal fields — not serialized to JSON
	Content   string `json:"-"`
	SessionID string `json:"-"`
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Message string        `json:"message"`
	FileIDs []string      `json:"fileIds"`
	History []ChatMessage `json:"history"`
}
