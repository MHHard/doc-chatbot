package services

import (
	"doc-chatbot/models"
	"doc-chatbot/store"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"
)

// ParseAsync triggers async parsing for a file; updates store on completion.
func ParseAsync(fileInfo *models.FileInfo, filePath string, cfg ParseConfig) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("panic parsing file %s: %v\n%s", fileInfo.ID, r, debug.Stack())
				errMsg := "解析失败，请重试"
				fileInfo.ParseStatus = models.ParseStatusFailed
				fileInfo.ParseError = &errMsg
				store.Global.Update(fileInfo)
			}
		}()

		content, warning, err := parseFile(fileInfo, filePath, cfg)
		f, ok := store.Global.Get(fileInfo.ID)
		if !ok {
			return
		}

		if err != nil {
			errMsg := err.Error()
			f.ParseStatus = models.ParseStatusFailed
			f.ParseError = &errMsg
		} else {
			f.Content = content
			f.ContentChars = len([]rune(content))
			f.ParseStatus = models.ParseStatusReady
			if warning != "" {
				f.ParseWarning = &warning
			}
		}
		store.Global.Update(f)
	}()
}

type ParseConfig struct {
	OCRAPIKey  string
	OCRAPIHost string
	UploadDir  string
}

func parseFile(info *models.FileInfo, filePath string, cfg ParseConfig) (content, warning string, err error) {
	// Check empty file
	stat, statErr := os.Stat(filePath)
	if statErr != nil || stat.Size() == 0 {
		return "", "", fmt.Errorf("文件内容为空")
	}

	ext := strings.ToLower(filepath.Ext(info.OriginalName))
	mime := info.MimeType

	switch {
	case ext == ".txt":
		return parseTXT(filePath)
	case ext == ".docx" || mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		return parseDOCX(filePath)
	case ext == ".pdf" || mime == "application/pdf":
		return parsePDF(filePath, cfg)
	case isImage(ext, mime):
		return parseImage(filePath, cfg)
	default:
		return "", "", fmt.Errorf("不支持此文件格式")
	}
}

func isImage(ext, mime string) bool {
	imgExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}
	imgMimes := map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}
	return imgExts[ext] || imgMimes[mime]
}

// parseTXT reads a plain text file.
func parseTXT(path string) (string, string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", "", fmt.Errorf("文件内容为空")
	}
	text := strings.TrimSpace(string(data))
	if text == "" {
		return "", "", fmt.Errorf("文件内容为空")
	}
	return text, "", nil
}

// Simulate a slow parse for demo purposes when no API key is set.
func simulateParse(name string) (string, string, error) {
	time.Sleep(2 * time.Second)
	content := fmt.Sprintf("[模拟解析] 文件 %s 的内容已提取（演示模式，未配置 OCR API）", name)
	return content, "", nil
}
