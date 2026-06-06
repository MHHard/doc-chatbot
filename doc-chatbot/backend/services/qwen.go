package services

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"doc-chatbot/models"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

type QwenConfig struct {
	APIKey  string
	APIHost string
}

type qwenMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type qwenRequest struct {
	Model    string        `json:"model"`
	Messages []qwenMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

// BuildMessages assembles the full message list for a chat request.
func BuildMessages(req models.ChatRequest, files []*models.FileInfo) []qwenMessage {
	systemPrompt := "你是一个专业的文档分析助手，擅长总结、分析和整理文档内容。\n请用中文回复，使用 Markdown 格式，结构清晰，重点突出。"

	var skipped []string
	var fileContent strings.Builder

	totalChars := 0
	for _, f := range files {
		if f.ParseStatus == models.ParseStatusReady {
			totalChars += len([]rune(f.Content))
		}
	}

	// Context limit: 100000 chars total
	used := 0
	for _, f := range files {
		switch f.ParseStatus {
		case models.ParseStatusReady:
			chars := len([]rune(f.Content))
			if totalChars > 100000 && used+chars > 100000 {
				skipped = append(skipped, f.Name)
				systemPrompt += fmt.Sprintf("\n[%s] 因上下文长度限制被跳过", f.Name)
				continue
			}
			fileContent.WriteString(fmt.Sprintf("### 文件：%s\n%s\n\n", f.Name, f.Content))
			used += chars
		case models.ParseStatusDeferred:
			systemPrompt += fmt.Sprintf("\n[%s] 尚未解析，本次跳过", f.Name)
		case models.ParseStatusPending:
			systemPrompt += fmt.Sprintf("\n[%s] 正在解析，本次跳过", f.Name)
		case models.ParseStatusFailed:
			systemPrompt += fmt.Sprintf("\n[%s] 解析失败，本次跳过", f.Name)
		}
	}
	_ = skipped

	messages := []qwenMessage{{Role: "system", Content: systemPrompt}}

	if fileContent.Len() > 0 {
		messages = append(messages, qwenMessage{Role: "user", Content: fileContent.String()})
	}

	// History (last 10)
	history := req.History
	if len(history) > 10 {
		history = history[len(history)-10:]
	}
	for _, h := range history {
		messages = append(messages, qwenMessage{Role: h.Role, Content: h.Content})
	}

	userMsg := req.Message
	if userMsg == "" {
		userMsg = "请分析这些文件内容"
	}
	messages = append(messages, qwenMessage{Role: "user", Content: userMsg})
	return messages
}

// writeError writes an SSE error event so the frontend always gets feedback.
func writeError(w io.Writer, flush func(), msg string) {
	log.Printf("[qwen] error: %s", msg)
	fmt.Fprintf(w, "data: %s\n\n", mustJSON(map[string]string{"content": "\n\n_错误：" + msg + "_"}))
	flush()
	fmt.Fprintf(w, "data: [DONE]\n\n")
	flush()
}

// StreamChatChunks sends a streaming chat request and calls onChunk for each token chunk.
func StreamChatChunks(messages []qwenMessage, cfg QwenConfig, onChunk func(string) error) error {
	var partial strings.Builder
	err := streamChatChunksOnce(messages, cfg, func(chunk string) error {
		partial.WriteString(chunk)
		return onChunk(chunk)
	})
	if err == nil || !isTransientStreamError(err) || strings.TrimSpace(partial.String()) == "" {
		return err
	}

	log.Printf("[qwen] transient stream error, retrying continuation: %v", err)
	retryMessages := append([]qwenMessage(nil), messages...)
	retryMessages = append(retryMessages,
		qwenMessage{Role: "assistant", Content: partial.String()},
		qwenMessage{Role: "user", Content: "刚才回答因为网络中断未完成。请从上一条回答的中断处继续，不要重复已经输出过的内容。"},
	)

	return streamChatChunksOnce(retryMessages, cfg, onChunk)
}

func streamChatChunksOnce(messages []qwenMessage, cfg QwenConfig, onChunk func(string) error) error {
	if cfg.APIKey == "" {
		chunks := []string{"（演示模式）", "未配置 QWEN_API_KEY，", "无法调用模型。", "\n\n请在 .env 中配置 QWEN_API_KEY 后重启服务。"}
		for _, c := range chunks {
			time.Sleep(80 * time.Millisecond)
			if err := onChunk(c); err != nil {
				return err
			}
		}
		return nil
	}

	endpoint := strings.TrimRight(cfg.APIHost, "/") + "/chat/completions"
	log.Printf("[qwen] calling %s", endpoint)

	body := qwenRequest{Model: "qwen-plus", Messages: messages, Stream: true}
	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("请求构建失败")
	}

	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("请求构建失败")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	// Some Alibaba Cloud Model Studio custom endpoints use subdomains not covered
	// by the *.aliyuncs.com wildcard certificate — skip TLS verify for those.
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
	}
	client := &http.Client{Timeout: 120 * time.Second, Transport: transport}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("网络请求失败：%s", err.Error())
	}
	defer resp.Body.Close()

	// Read full body for non-200 to surface error message
	if resp.StatusCode != 200 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		msg := fmt.Sprintf("API 返回 %d: %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
		return fmt.Errorf(msg)
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64*1024), 64*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			return nil
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			if err := onChunk(chunk.Choices[0].Delta.Content); err != nil {
				return err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("流读取失败：%s", err.Error())
	}
	return nil
}

func isTransientStreamError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "unexpected eof") ||
		strings.Contains(msg, "stream error") ||
		strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "timeout") ||
		strings.Contains(msg, "broken pipe") ||
		strings.Contains(msg, "流读取失败")
}

func UserFacingStreamError(err error) string {
	if isTransientStreamError(err) {
		return "模型连接中断，请稍后重试"
	}
	if err == nil {
		return "生成失败，请稍后重试"
	}
	msg := err.Error()
	if strings.Contains(msg, "API 返回") {
		return msg
	}
	return "生成失败，请稍后重试"
}

// StreamChat sends a streaming chat request and writes SSE chunks to w.
func StreamChat(messages []qwenMessage, cfg QwenConfig, w io.Writer, flush func()) error {
	err := StreamChatChunks(messages, cfg, func(chunk string) error {
		if _, err := fmt.Fprintf(w, "data: %s\n\n", mustJSON(map[string]string{"content": chunk})); err != nil {
			return err
		}
		flush()
		return nil
	})
	if err != nil {
		writeError(w, flush, err.Error())
		return err
	}
	fmt.Fprintf(w, "data: [DONE]\n\n")
	flush()
	return nil
}

func mustJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}
