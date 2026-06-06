package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	QwenAPIKey  string
	QwenAPIHost string
	OCRAPIKey   string
	OCRAPIHost  string
	WorkspaceID string
	UploadDir   string
	Port        string
}

func Load() *Config {
	_ = godotenv.Load()

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	return &Config{
		QwenAPIKey:  os.Getenv("QWEN_API_KEY"),
		QwenAPIHost: os.Getenv("QWEN_API_HOST"),
		OCRAPIKey:   os.Getenv("OCR_API_KEY"),
		OCRAPIHost:  os.Getenv("OCR_API_HOST"),
		WorkspaceID: os.Getenv("WORKSPACE_ID"),
		UploadDir:   uploadDir,
		Port:        port,
	}
}
