package services

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
)

// parseDOCX extracts text from a DOCX file using local XML parsing.
func parseDOCX(path string) (string, string, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return "", "", fmt.Errorf("文件损坏，无法解析")
	}
	defer r.Close()

	var docFile *zip.File
	for _, f := range r.File {
		if f.Name == "word/document.xml" {
			docFile = f
			break
		}
	}
	if docFile == nil {
		return "", "", fmt.Errorf("文件损坏，无法解析")
	}

	rc, err := docFile.Open()
	if err != nil {
		return "", "", fmt.Errorf("文件损坏，无法解析")
	}
	defer rc.Close()

	text, err := extractDocxText(rc)
	if err != nil {
		return "", "", fmt.Errorf("文件损坏，无法解析")
	}
	if strings.TrimSpace(text) == "" {
		return "", "", fmt.Errorf("文件内容为空")
	}

	return text, "", nil
}

func extractDocxText(r io.Reader) (string, error) {
	var sb strings.Builder
	decoder := xml.NewDecoder(r)
	inText := false

	for {
		tok, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Local == "t" {
				inText = true
			} else if t.Name.Local == "p" {
				sb.WriteString("\n")
			}
		case xml.EndElement:
			if t.Name.Local == "t" {
				inText = false
			}
		case xml.CharData:
			if inText {
				sb.Write(t)
			}
		}
	}
	return strings.TrimSpace(sb.String()), nil
}
