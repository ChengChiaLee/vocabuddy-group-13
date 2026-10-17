import { ArrowRight, Check, RotateCcw, Trophy } from 'lucide-react';

export function IconButton({ label, children, className = '', ...props }) {
  return (
    <button
      className={`icon-button ${className}`}
      type="button"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ value, total, label }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total || 1}
      aria-valuenow={value}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={30} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function SessionSummary({ session, onRestart, onReview, onQuiz }) {
  const known = Object.values(session.ratings).filter((status) => status === 'known').length;
  const review = session.ids.length - known;
  return (
    <section className="summary-card" aria-labelledby="summary-title">
      <div className="summary-art">
        <Trophy size={40} strokeWidth={1.6} />
      </div>
      <span className="eyebrow">每一點努力，都算數</span>
      <h2 id="summary-title">今天的單字，完成了！</h2>
      <p>你又為自己累積了 {session.ids.length} 個單字的練習。</p>
      <div className="summary-numbers">
        <div>
          <strong>{known}</strong>
          <span>
            <Check size={15} /> 已經記住
          </span>
        </div>
        <div>
          <strong>{review}</strong>
          <span>
            <RotateCcw size={15} /> 繼續複習
          </span>
        </div>
      </div>
      <div className="summary-actions">
        <button className="button primary" onClick={onQuiz}>
          考我單詞 <ArrowRight size={17} />
        </button>
        {review > 0 && (
          <button className="button secondary" onClick={onReview}>
            複習忘記的單字
          </button>
        )}
        <button className="text-button" onClick={onRestart}>
          <RotateCcw size={15} /> 再學一次
        </button>
      </div>
    </section>
  );
}

export function shouldIgnoreShortcut(event) {
  return (
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target.isContentEditable ||
    Boolean(event.target.closest('input, textarea, select, [role="dialog"]'))
  );
}
