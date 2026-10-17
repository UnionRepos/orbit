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
import { useI18n } from '../i18n/index.ts'
import { compactNumber, relativeTime } from '../lib/format.ts'
import { cacheRepo } from '../lib/repoCache.ts'
import { navigate, repoPath } from '../lib/router.ts'
import { EmptyState } from './EmptyState.tsx'
import { RepoCard } from './RepoCard.tsx'

export function SavedPage() {
  const { saved, recent, removeSaved, updateNote, clearSaved, clearRecent, toast } = useOrbit()
  const { t } = useI18n()

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
      toast(t('saved.exported'), 'success')
    } catch {
      toast(t('saved.exportFailed'), 'error')
    }
  }

  function confirmClear() {
    if (saved.length === 0) return
    if (window.confirm(t('saved.confirmClear', { count: saved.length }))) {
      clearSaved()
      toast(t('saved.cleared'), 'info')
    }
  }

  return (
    <div className="saved-page">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={15} /> {t('common.back')}
      </button>

      <header className="saved-header">
        <div>
          <div className="eyebrow">
            <Bookmark size={12} /> {t('saved.eyebrow')}
          </div>
          <h1>{t('saved.title')}</h1>
          <p>{t('saved.body')}</p>
        </div>
        <div className="saved-actions">
          <button className="btn" onClick={exportList} disabled={saved.length === 0}>
            <Download size={14} /> {t('saved.export')}
          </button>
          <button className="btn btn-danger" onClick={confirmClear} disabled={saved.length === 0}>
            <Trash2 size={14} /> {t('saved.clear')}
          </button>
        </div>
      </header>

      {saved.length > 0 && (
        <div className="saved-stats">
          <div>
            <strong>{saved.length}</strong>
            <span>{t('saved.statSaved')}</span>
          </div>
          <div>
            <strong>{compactNumber(totalStars)}</strong>
            <span>{t('saved.statStars')}</span>
          </div>
          <div>
            <strong>{new Set(saved.map((entry) => entry.repo.language)).size}</strong>
            <span>{t('saved.statLanguages')}</span>
          </div>
          <div>
            <strong>{saved.filter((entry) => entry.note.trim()).length}</strong>
            <span>{t('saved.statNotes')}</span>
          </div>
        </div>
      )}

      {saved.length === 0 ? (
        <EmptyState
          icon={<Bookmark size={22} />}
          title={t('saved.emptyTitle')}
          description={t('saved.emptyBody')}
          action={
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              {t('saved.emptyCta')}
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
                  <span>{t('saved.noteHead')}</span>
                  <button
                    className="icon-btn danger"
                    onClick={() => {
                      removeSaved(entry.repo.fullName)
                      toast(t('card.removedToast', { name: entry.repo.name }), 'info')
                    }}
                    title={t('saved.removeTitle')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <textarea
                  value={entry.note}
                  onChange={(event) => updateNote(entry.repo.fullName, event.target.value)}
                  onBlur={() => entry.note.trim() && toast(t('saved.noteSaved'), 'success')}
                  placeholder={t('saved.notePlaceholder')}
                  maxLength={600}
                  rows={4}
                  aria-label={t('saved.noteAria', { name: entry.repo.name })}
                />
                <div className="saved-note-meta">
                  <span>
                    <Clock3 size={12} />
                    {t('saved.savedAt', { time: relativeTime(new Date(entry.savedAt).toISOString()) })}
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
              <Clock3 size={15} /> {t('saved.recent')}
            </h2>
            <button className="link-btn" onClick={clearRecent}>
              {t('saved.clearHistory')}
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
        <FileJson size={13} /> {t('saved.foot')}
      </p>
    </div>
  )
}
