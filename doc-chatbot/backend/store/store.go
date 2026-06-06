package store

import (
	"doc-chatbot/models"
	"sync"
)

type MemoryStore struct {
	mu    sync.RWMutex
	files map[string]*models.FileInfo
	order []string // insertion order
}

var Global = &MemoryStore{
	files: make(map[string]*models.FileInfo),
}

func (s *MemoryStore) Add(f *models.FileInfo) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.files[f.ID] = f
	s.order = append([]string{f.ID}, s.order...) // newest first
}

func (s *MemoryStore) Get(id string) (*models.FileInfo, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	f, ok := s.files[id]
	return f, ok
}

func (s *MemoryStore) Update(f *models.FileInfo) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.files[f.ID] = f
}

func (s *MemoryStore) Delete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.files[id]; !ok {
		return false
	}
	delete(s.files, id)
	newOrder := make([]string, 0, len(s.order))
	for _, oid := range s.order {
		if oid != id {
			newOrder = append(newOrder, oid)
		}
	}
	s.order = newOrder
	return true
}

func (s *MemoryStore) List(sessionID string) []*models.FileInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	list := make([]*models.FileInfo, 0)
	for _, id := range s.order {
		if f, ok := s.files[id]; ok && f.SessionID == sessionID {
			list = append(list, f)
		}
	}
	return list
}

func (s *MemoryStore) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.files = make(map[string]*models.FileInfo)
	s.order = nil
}
