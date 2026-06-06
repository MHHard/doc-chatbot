package handlers

import (
	"bufio"
	"doc-chatbot/models"
	"doc-chatbot/services"
	"doc-chatbot/store"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

type streamEvent struct {
	Type     string `json:"type,omitempty"`
	StreamID string `json:"streamId"`
	Seq      int    `json:"seq"`
	Content  string `json:"content,omitempty"`
	Error    string `json:"error,omitempty"`
}

// StreamChat handles POST /api/chat/stream (SSE)
func StreamChat(c *fiber.Ctx) error {
	var req models.ChatRequest
	if err := c.BodyParser(&req); err != nil || (req.Message == "" && len(req.FileIDs) == 0) {
		return c.Status(400).JSON(fiber.Map{"error": "请输入消息"})
	}

	sid := strings.TrimSpace(c.Get("X-Session-Id"))

	var files []*models.FileInfo
	for _, id := range req.FileIDs {
		if f, ok := store.Global.Get(id); ok && (sid == "" || f.SessionID == sid) {
			files = append(files, f)
		}
	}

	messages := services.BuildMessages(req, files)
	qwenCfg := services.QwenConfig{
		APIKey:  cfg.QwenAPIKey,
		APIHost: cfg.QwenAPIHost,
	}

	run := store.NewChatRun()
	store.ChatRuns.Add(run)

	go func() {
		err := services.StreamChatChunks(messages, qwenCfg, func(chunk string) error {
			run.Append(chunk)
			return nil
		})
		if err != nil {
			run.Fail(services.UserFacingStreamError(err))
			return
		}
		run.Finish()
	}()

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		streamRun(run, 0, w)
	})

	return nil
}

// ResumeChat handles GET /api/chat/stream/:id?from=N.
func ResumeChat(c *fiber.Ctx) error {
	run, ok := store.ChatRuns.Get(c.Params("id"))
	if !ok {
		return c.Status(404).JSON(fiber.Map{"error": "生成任务不存在或已过期"})
	}

	from, _ := strconv.Atoi(c.Query("from", "0"))

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		streamRun(run, from, w)
	})

	return nil
}

func streamRun(run *store.ChatRun, from int, w *bufio.Writer) {
	if from == 0 {
		if err := writeStreamEvent(w, streamEvent{Type: "meta", StreamID: run.ID, Seq: 0}); err != nil {
			return
		}
	}

	sent := from
	for {
		chunks, done, errMsg := run.SnapshotFrom(sent)
		for _, chunk := range chunks {
			sent++
			if err := writeStreamEvent(w, streamEvent{StreamID: run.ID, Seq: sent, Content: chunk}); err != nil {
				return
			}
		}

		if errMsg != "" {
			_ = writeStreamEvent(w, streamEvent{Type: "error", StreamID: run.ID, Seq: sent, Error: errMsg, Content: "\n\n_错误：" + errMsg + "_"})
			fmt.Fprint(w, "data: [DONE]\n\n")
			_ = w.Flush()
			return
		}
		if done {
			fmt.Fprint(w, "data: [DONE]\n\n")
			_ = w.Flush()
			return
		}
		run.WaitForUpdate(sent)
	}
}

func writeStreamEvent(w *bufio.Writer, event streamEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", data); err != nil {
		return err
	}
	return w.Flush()
}
