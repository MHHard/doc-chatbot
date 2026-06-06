package services

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type ocrRequest struct {
	Model    string       `json:"model"`
	Messages []ocrMessage `json:"messages"`
}

type ocrMessage struct {
	Role    string       `json:"role"`
	Content []ocrContent `json:"content"`
}

type ocrContent struct {
	Type     string    `json:"type"`
	ImageURL *imageURL `json:"image_url,omitempty"`
	Text     string    `json:"text,omitempty"`
}

type imageURL struct {
	URL string `json:"url"`
}

type ocrResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// callOCR sends a base64-encoded image to DashScope OCR API and returns extracted text.
func callOCR(dataURL, apiKey, apiHost string) (string, error) {
	if apiKey == "" {
		return "", fmt.Errorf("OCR 服务异常，请稍后重试")
	}

	endpoint := strings.TrimRight(apiHost, "/") + "/chat/completions"

	body := ocrRequest{
		Model: "qwen-vl-ocr",
		Messages: []ocrMessage{
			{
				Role: "user",
				Content: []ocrContent{
					{Type: "image_url", ImageURL: &imageURL{URL: dataURL}},
					{Type: "text", Text: "请提取图片中的所有文字内容，保持原有格式。"},
				},
			},
		},
	}

	payload, _ := json.Marshal(body)
	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("OCR 服务异常，请稍后重试")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
	}
	client := &http.Client{Timeout: 60 * time.Second, Transport: transport}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("OCR 服务异常，请稍后重试")
	}
	defer resp.Body.Close()

	var result ocrResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("OCR 服务异常，请稍后重试")
	}
	if result.Error != nil {
		return "", fmt.Errorf("OCR 服务异常，请稍后重试")
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("OCR 服务异常，请稍后重试")
	}

	text := strings.TrimSpace(result.Choices[0].Message.Content)
	return text, nil
}

// parseImage reads an image file and extracts text via OCR.
func parseImage(path string, cfg ParseConfig) (string, string, error) {
	if cfg.OCRAPIKey == "" {
		return simulateParse(path)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return "", "", fmt.Errorf("OCR 服务异常，请稍后重试")
	}

	ext := strings.ToLower(path[strings.LastIndex(path, ".")+1:])
	mimeMap := map[string]string{
		"jpg": "image/jpeg", "jpeg": "image/jpeg",
		"png": "image/png", "webp": "image/webp",
	}
	mime, ok := mimeMap[ext]
	if !ok {
		mime = "image/jpeg"
	}

	dataURL := fmt.Sprintf("data:%s;base64,%s", mime, base64.StdEncoding.EncodeToString(data))
	text, err := callOCR(dataURL, cfg.OCRAPIKey, cfg.OCRAPIHost)
	if err != nil {
		return "", "", err
	}

	if strings.TrimSpace(text) == "" {
		warning := "图片中未检测到文字"
		return "", warning, nil
	}

	return text, "", nil
}

// imageToBase64DataURL converts a raw image file to data URL.
func imageToBase64DataURL(path, mimeType string) (string, error) {
	data, err := io.ReadAll(mustOpen(path))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(data)), nil
}

func mustOpen(path string) *os.File {
	f, _ := os.Open(path)
	return f
}
