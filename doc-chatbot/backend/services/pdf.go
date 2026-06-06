package services

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// parsePDF extracts the text layer first, then falls back to OCR for scanned PDFs.
func parsePDF(path string, cfg ParseConfig) (string, string, error) {
	if content, warning, err := parsePDFTextLayer(path); err != nil {
		if strings.Contains(err.Error(), "文件已加密") {
			return "", "", err
		}
	} else if strings.TrimSpace(content) != "" {
		return content, warning, nil
	}

	if cfg.OCRAPIKey == "" {
		return simulateParse(path)
	}

	// Check if pdftoppm is available
	if _, err := exec.LookPath("pdftoppm"); err != nil {
		return "", "", fmt.Errorf("OCR 服务异常，请稍后重试")
	}

	// Create temp dir for page images
	tmpDir, err := os.MkdirTemp("", "pdf_pages_*")
	if err != nil {
		return "", "", fmt.Errorf("OCR 服务异常，请稍后重试")
	}
	defer os.RemoveAll(tmpDir)

	// Convert PDF to images (300 dpi, jpeg)
	prefix := filepath.Join(tmpDir, "page")
	cmd := exec.Command("pdftoppm", "-jpeg", "-r", "150", path, prefix)
	if out, err := cmd.CombinedOutput(); err != nil {
		if strings.Contains(string(out), "Incorrect password") {
			return "", "", fmt.Errorf("文件已加密，无法读取")
		}
		return "", "", fmt.Errorf("OCR 服务异常，请稍后重试")
	}

	// Find generated page images
	entries, err := os.ReadDir(tmpDir)
	if err != nil || len(entries) == 0 {
		return "", "", fmt.Errorf("文件内容为空")
	}

	var pageImages []string
	for _, entry := range entries {
		if !entry.IsDir() {
			pageImages = append(pageImages, filepath.Join(tmpDir, entry.Name()))
		}
	}
	sort.Strings(pageImages)

	pageTexts := make([]string, len(pageImages))
	sem := make(chan struct{}, 3)
	var wg sync.WaitGroup
	for i, imgPath := range pageImages {
		wg.Add(1)
		go func(i int, imgPath string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			data, err := os.ReadFile(imgPath)
			if err != nil {
				return
			}
			dataURL := "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(data)
			text, err := callOCR(dataURL, cfg.OCRAPIKey, cfg.OCRAPIHost)
			if err != nil {
				return
			}
			pageTexts[i] = text
		}(i, imgPath)
	}
	wg.Wait()

	var allText strings.Builder
	for _, text := range pageTexts {
		if strings.TrimSpace(text) == "" {
			continue
		}
		allText.WriteString(text)
		allText.WriteString("\n\n")
	}

	result := strings.TrimSpace(allText.String())
	if result == "" {
		return "", "", fmt.Errorf("OCR 服务异常，请稍后重试")
	}

	return result, "", nil
}

func parsePDFTextLayer(path string) (string, string, error) {
	if _, err := exec.LookPath("pdftotext"); err != nil {
		return "", "", fmt.Errorf("no pdftotext")
	}

	out, err := exec.Command("pdftotext", "-layout", "-enc", "UTF-8", path, "-").CombinedOutput()
	if err != nil {
		if strings.Contains(string(out), "Incorrect password") {
			return "", "", fmt.Errorf("文件已加密，无法读取")
		}
		return "", "", err
	}

	text := strings.TrimSpace(string(out))
	if text == "" {
		return "", "", fmt.Errorf("empty text layer")
	}

	return text, "", nil
}
