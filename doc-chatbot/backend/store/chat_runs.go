package store

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

type ChatRun struct {
	ID        string
	CreatedAt time.Time

	mu     sync.Mutex
	cond   *sync.Cond
	chunks []string
	done   bool
	err    string
}

func NewChatRun() *ChatRun {
	run := &ChatRun{
		ID:        uuid.New().String(),
		CreatedAt: time.Now(),
	}
	run.cond = sync.NewCond(&run.mu)
	return run
}

func (r *ChatRun) Append(chunk string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.done || r.err != "" {
		return
	}
	r.chunks = append(r.chunks, chunk)
	r.cond.Broadcast()
}

func (r *ChatRun) Finish() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.done = true
	r.cond.Broadcast()
}

func (r *ChatRun) Fail(err string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.err = err
	r.done = true
	r.cond.Broadcast()
}

func (r *ChatRun) SnapshotFrom(from int) ([]string, bool, string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if from < 0 {
		from = 0
	}
	if from > len(r.chunks) {
		from = len(r.chunks)
	}
	chunks := append([]string(nil), r.chunks[from:]...)
	return chunks, r.done, r.err
}

func (r *ChatRun) WaitForUpdate(from int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for len(r.chunks) <= from && !r.done && r.err == "" {
		r.cond.Wait()
	}
}

type ChatRunStore struct {
	mu   sync.RWMutex
	runs map[string]*ChatRun
}

var ChatRuns = &ChatRunStore{runs: make(map[string]*ChatRun)}

func (s *ChatRunStore) Add(run *ChatRun) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.ID] = run
}

func (s *ChatRunStore) Get(id string) (*ChatRun, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	run, ok := s.runs[id]
	return run, ok
}

func (s *ChatRunStore) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs = make(map[string]*ChatRun)
}
