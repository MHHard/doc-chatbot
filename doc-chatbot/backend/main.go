package main

import (
	"doc-chatbot/config"
	"doc-chatbot/handlers"
	"doc-chatbot/store"
	"log"
	"os"
	"path/filepath"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

func main() {
	cfg := config.Load()

	// Startup cleanup: clear upload dir
	if err := cleanUploadDir(cfg.UploadDir); err != nil {
		log.Fatalf("failed to clean upload dir: %v", err)
	}
	store.Global.Clear()
	store.ChatRuns.Clear()

	handlers.Init(cfg)

	app := fiber.New(fiber.Config{
		BodyLimit: 60 * 1024 * 1024, // 60MB to allow headroom
	})

	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "http://localhost:5173,http://localhost:4173",
		AllowHeaders: "Origin, Content-Type, Accept, X-Session-Id",
		AllowMethods: "GET, POST, PATCH, DELETE, OPTIONS",
	}))

	api := app.Group("/api")

	files := api.Group("/files")
	files.Post("/upload", handlers.UploadFile)
	files.Get("/", handlers.ListFiles)
	files.Get("/:id/status", handlers.GetFileStatus)
	files.Get("/:id/download", handlers.DownloadFile)
	files.Patch("/:id/rename", handlers.RenameFile)
	files.Delete("/:id", handlers.DeleteFile)
	files.Post("/:id/reparse", handlers.ReparseFile)

	chat := api.Group("/chat")
	chat.Post("/stream", handlers.StreamChat)
	chat.Get("/stream/:id", handlers.ResumeChat)

	log.Printf("Server starting on :%s", cfg.Port)
	log.Fatal(app.Listen(":" + cfg.Port))
}

func cleanUploadDir(dir string) error {
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return err
	}

	// Remove all files in the directory
	entries, err := os.ReadDir(absDir)
	if err != nil {
		if os.IsNotExist(err) {
			return os.MkdirAll(absDir, 0755)
		}
		return err
	}
	for _, e := range entries {
		if err := os.Remove(filepath.Join(absDir, e.Name())); err != nil {
			log.Printf("warn: could not remove %s: %v", e.Name(), err)
		}
	}
	return nil
}
