import {
  ArrowLeft,
  Bookmark,
  Clock3,
  Download,
  FileJson,
  NotebookPen,
  Star,
  Trash2,
} from 'lucide-react'
import { useOrbit } from '../context/OrbitContext.tsx'
import { compactNumber, relativeTime } from '../lib/format.ts'
import { cacheRepo } from '../lib/repoCache.ts'
import { navigate, repoPath } from '../lib/router.ts'
import { EmptyState } from './EmptyState.tsx'
import { RepoCard } from './RepoCard.tsx'

export function SavedPage() {
  const { saved, recent, removeSaved, updateNote, clearSaved, clearRecent, toast } = useOrbit()

  const totalStars = saved.reduce((sum, entry) => sum + entry.repo.stars, 0)

  function exportList() {
    const payload = saved.map((entry) => ({
      repository: entry.repo.fullName,
      url: entry.repo.htmlUrl,
      description: entry.repo.description,
      language: entry.repo.language,
      stars: entry.repo.stars,
      note: entry.note,
      savedAt: new Date(entry.savedAt).toISOString(),
    }))
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'orbit-reading-list.json'
      anchor.click()
      URL.revokeObjectURL(url)
      toast('Reading list exported', 'success')
    } catch {
      toast('Could not export the reading list', 'error')
    }
  }

  function confirmClear() {
    if (saved.length === 0) return
    if (window.confirm(`Remove all ${saved.length} projects from your reading list?`)) {
      clearSaved()
      toast('Reading list cleared', 'info')
    }
  }

  return (
    <div className="saved-page">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={15} /> Back to discover
      </button>

      <header className="saved-header">
        <div>
          <div className="eyebrow">
            <Bookmark size={12} /> Your library
          </div>
          <h1>Reading list</h1>
          <p>
            Projects saved for later. Add a note to remember what caught your eye.
          </p>
        </div>
        <div className="saved-actions">
          <button className="btn" onClick={exportList} disabled={saved.length === 0}>
            <Download size={14} /> Export JSON
          </button>
          <button className="btn btn-danger" onClick={confirmClear} disabled={saved.length === 0}>
            <Trash2 size={14} /> Clear all
          </button>
        </div>
      </header>

      {saved.length > 0 && (
        <div className="saved-stats">
          <div>
            <strong>{saved.length}</strong>
            <span>saved projects</span>
          </div>
          <div>
            <strong>{compactNumber(totalStars)}</strong>
            <span>combined stars</span>
          </div>
          <div>
            <strong>{new Set(saved.map((entry) => entry.repo.language)).size}</strong>
            <span>languages</span>
          </div>
          <div>
            <strong>{saved.filter((entry) => entry.note.trim()).length}</strong>
            <span>notes written</span>
          </div>
        </div>
      )}

      {saved.length === 0 ? (
        <EmptyState
          icon={<Bookmark size={22} />}
          title="No saved projects yet"
          description="Save projects from the feed with the bookmark button. They stay on this device, no account needed."
          action={
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Find something to save
            </button>
          }
        />
      ) : (
        <div className="saved-list">
          {saved.map((entry) => (
            <div className="saved-entry" key={entry.repo.fullName}>
              <RepoCard repo={entry.repo} variant="grid" />
              <div className="saved-note">
                <div className="saved-note-head">
                  <NotebookPen size={14} />
                  <span>Why this one?</span>
                  <button
                    className="icon-btn danger"
                    onClick={() => {
                      removeSaved(entry.repo.fullName)
                      toast(`Removed ${entry.repo.name}`, 'info')
                    }}
                    title="Remove from reading list"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <textarea
                  value={entry.note}
                  onChange={(event) => updateNote(entry.repo.fullName, event.target.value)}
                  onBlur={() => entry.note.trim() && toast('Note saved', 'success')}
                  placeholder="What would you use this project for?"
                  maxLength={600}
                  rows={4}
                  aria-label={`Notes for ${entry.repo.name}`}
                />
                <div className="saved-note-meta">
                  <span>
                    <Clock3 size={12} /> saved {relativeTime(new Date(entry.savedAt).toISOString())}
                  </span>
                  <span>{entry.note.length}/600</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <section className="recent-section">
          <div className="profile-section-head">
            <h2>
              <Clock3 size={15} /> Recently viewed
            </h2>
            <button className="link-btn" onClick={clearRecent}>
              Clear history
            </button>
          </div>
          <div className="recent-grid">
            {recent.map((entry) => (
              <button
                key={entry.repo.fullName}
                className="recent-card"
                onClick={() => {
                  cacheRepo(entry.repo)
                  navigate(repoPath(entry.repo.owner.login, entry.repo.name))
                }}
              >
                <img src={entry.repo.owner.avatarUrl} alt="" loading="lazy" />
                <span className="recent-card-name">
                  <strong>{entry.repo.fullName}</strong>
                  <small>{relativeTime(new Date(entry.viewedAt).toISOString())}</small>
                </span>
                <span className="recent-card-stars">
                  <Star size={12} /> {compactNumber(entry.repo.stars)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="saved-foot">
        <FileJson size={13} /> Everything here is stored locally in your browser. Export any time.
      </p>
    </div>
  )
}
