package handlers

import (
	"doc-chatbot/config"
	"doc-chatbot/models"
	"doc-chatbot/services"
	"doc-chatbot/store"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

var cfg *config.Config

func Init(c *config.Config) {
	cfg = c
}

func sessionID(c *fiber.Ctx) (string, error) {
	id := strings.TrimSpace(c.Get("X-Session-Id"))
	if id == "" {
		return "", c.Status(400).JSON(fiber.Map{"error": "缺少 X-Session-Id 请求头"})
	}
	return id, nil
}

var allowedMimes = map[string]bool{
	"application/pdf": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
	"text/plain":  true,
	"image/jpeg":  true,
	"image/png":   true,
	"image/webp":  true,
}

var allowedExts = map[string]bool{
	".pdf": true, ".docx": true, ".txt": true,
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true,
}

const maxFileSize = 50 * 1024 * 1024 // 50MB

// UploadFile handles POST /api/files/upload
func UploadFile(c *fiber.Ctx) error {
	sid, err := sessionID(c)
	if err != nil {
		return err
	}
	fh, err := c.FormFile("file")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "请选择要上传的文件"})
	}

	// Size check
	if fh.Size > maxFileSize {
		return c.Status(400).JSON(fiber.Map{"error": "文件超过 50MB 限制"})
	}

	// Extension check
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if !allowedExts[ext] {
		return c.Status(400).JSON(fiber.Map{"error": "不支持此文件格式"})
	}

	// MIME check
	mimeType := fh.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = extToMime(ext)
	}

	id := uuid.New().String()
	saveName := id + ext
	savePath := filepath.Join(cfg.UploadDir, saveName)

	if err := c.SaveFile(fh, savePath); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "上传超时，请检查网络"})
	}

	defer_ := c.Query("defer") == "true"
	status := models.ParseStatusPending
	if defer_ {
		status = models.ParseStatusDeferred
	}

	info := &models.FileInfo{
		ID:           id,
		Name:         fh.Filename,
		OriginalName: fh.Filename,
		Size:         fh.Size,
		MimeType:     mimeType,
		UploadedAt:   time.Now(),
		ParseStatus:  status,
		SessionID:    sid,
	}
	store.Global.Add(info)

	if !defer_ {
		parseCfg := services.ParseConfig{
			OCRAPIKey:  cfg.OCRAPIKey,
			OCRAPIHost: cfg.OCRAPIHost,
			UploadDir:  cfg.UploadDir,
		}
		services.ParseAsync(info, savePath, parseCfg)
	}

	return c.Status(201).JSON(info)
}

// ListFiles handles GET /api/files
func ListFiles(c *fiber.Ctx) error {
	sid, err := sessionID(c)
	if err != nil {
		return err
	}
	return c.JSON(store.Global.List(sid))
}

// RenameFile handles PATCH /api/files/:id/rename
func RenameFile(c *fiber.Ctx) error {
	sid, err := sessionID(c)
	if err != nil {
		return err
	}
	id := c.Params("id")
	f, ok := store.Global.Get(id)
	if !ok || f.SessionID != sid {
		return c.Status(404).JSON(fiber.Map{"error": "文件不存在"})
	}

	var body struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		return c.Status(400).JSON(fiber.Map{"error": "请提供新文件名"})
	}

	// Preserve extension
	origExt := strings.ToLower(filepath.Ext(f.OriginalName))
	newName := strings.TrimSpace(body.Name)
	if strings.ToLower(filepath.Ext(newName)) != origExt {
		newName = strings.TrimSuffix(newName, filepath.Ext(newName)) + origExt
	}

	f.Name = newName
	store.Global.Update(f)
	return c.JSON(f)
}

// DeleteFile handles DELETE /api/files/:id
func DeleteFile(c *fiber.Ctx) error {
	sid, err := sessionID(c)
	if err != nil {
		return err
	}
	id := c.Params("id")
	f, ok := store.Global.Get(id)
	if !ok || f.SessionID != sid {
		return c.Status(404).JSON(fiber.Map{"error": "文件不存在"})
	}

	ext := strings.ToLower(filepath.Ext(f.OriginalName))
	savePath := filepath.Join(cfg.UploadDir, id+ext)

	store.Global.Delete(id)
	// Best-effort file removal
	_ = removeFile(savePath)

	return c.SendStatus(204)
}

// DownloadFile handles GET /api/files/:id/download
func DownloadFile(c *fiber.Ctx) error {
	sid, err := sessionID(c)
	if err != nil {
		return err
	}
	id := c.Params("id")
	f, ok := store.Global.Get(id)
	if !ok || f.SessionID != sid {
		return c.Status(404).JSON(fiber.Map{"error": "文件不存在"})
	}

	ext := strings.ToLower(filepath.Ext(f.OriginalName))
	savePath := filepath.Join(cfg.UploadDir, id+ext)

	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, f.Name))
	return c.SendFile(savePath)
}

// ReparseFile handles POST /api/files/:id/reparse
func ReparseFile(c *fiber.Ctx) error {
	sid, err := sessionID(c)
	if err != nil {
		return err
	}
	id := c.Params("id")
	f, ok := store.Global.Get(id)
	if !ok || f.SessionID != sid {
		return c.Status(404).JSON(fiber.Map{"error": "文件不存在"})
	}

	f.ParseStatus = models.ParseStatusPending
	f.ParseError = nil
	f.ParseWarning = nil
	f.Content = ""
	store.Global.Update(f)

	ext := strings.ToLower(filepath.Ext(f.OriginalName))
	savePath := filepath.Join(cfg.UploadDir, id+ext)

	parseCfg := services.ParseConfig{
		OCRAPIKey:  cfg.OCRAPIKey,
		OCRAPIHost: cfg.OCRAPIHost,
		UploadDir:  cfg.UploadDir,
	}
	services.ParseAsync(f, savePath, parseCfg)

	return c.JSON(f)
}

// GetFileStatus handles GET /api/files/:id/status
func GetFileStatus(c *fiber.Ctx) error {
	sid, err := sessionID(c)
	if err != nil {
		return err
	}
	id := c.Params("id")
	f, ok := store.Global.Get(id)
	if !ok || f.SessionID != sid {
		return c.Status(404).JSON(fiber.Map{"error": "文件不存在"})
	}
	return c.JSON(f)
}

func extToMime(ext string) string {
	m := map[string]string{
		".pdf":  "application/pdf",
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".txt":  "text/plain",
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".png":  "image/png",
		".webp": "image/webp",
	}
	if v, ok := m[ext]; ok {
		return v
	}
	return "application/octet-stream"
}
