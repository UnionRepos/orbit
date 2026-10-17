export function FeedSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="feed-list" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="repo-card skeleton-card" key={index}>
          <div className="skeleton skeleton-avatar" />
          <div className="skeleton-body">
            <div className="skeleton skeleton-line w-30" />
            <div className="skeleton skeleton-line w-70 tall" />
            <div className="skeleton skeleton-line w-90" />
            <div className="skeleton-chip-row">
              <div className="skeleton skeleton-chip" />
              <div className="skeleton skeleton-chip" />
              <div className="skeleton skeleton-chip" />
            </div>
            <div className="skeleton skeleton-line w-50" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="detail-skeleton" aria-hidden="true">
      <div className="skeleton skeleton-line w-20" />
      <div className="skeleton skeleton-hero" />
      <div className="detail-skeleton-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="skeleton skeleton-stat" key={index} />
        ))}
      </div>
      <div className="detail-skeleton-body">
        <div className="skeleton skeleton-readme" />
        <div className="skeleton skeleton-aside" />
      </div>
    </div>
  )
}

export function ReadmeSkeleton() {
  return (
    <div className="readme-skeleton" aria-hidden="true">
      {[45, 85, 70, 92, 60, 78, 40].map((width, index) => (
        <div className="skeleton skeleton-line" style={{ width: `${width}%` }} key={index} />
      ))}
      <div className="skeleton skeleton-code" />
      {[80, 65, 90].map((width, index) => (
        <div className="skeleton skeleton-line" style={{ width: `${width}%` }} key={`b-${index}`} />
      ))}
    </div>
  )
}
