import { CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { useOrbit } from '../context/OrbitContext.tsx'
import { useI18n } from '../i18n/index.ts'

export function Toasts() {
  const { toasts, dismissToast } = useOrbit()
  const { t } = useI18n()

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          <span className="toast-icon">
            {toast.kind === 'success' ? (
              <CheckCircle2 size={16} />
            ) : toast.kind === 'error' ? (
              <XCircle size={16} />
            ) : (
              <Info size={16} />
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button onClick={() => dismissToast(toast.id)} aria-label={t('common.dismiss')}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
