import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, Lightbulb, Sparkles, Volume2 } from 'lucide-react';
import { RATINGS, RATING_LABELS, newReview, scheduleReview, nextReviewLabel } from '../lib/srs.js';
import ExamplePanel from './ExamplePanel.jsx';
import { IconButton, shouldIgnoreShortcut } from './ui.jsx';

export default function Flashcard({
  word,
  index,
  total,
  queueIndex = index,
  queueLength = total,
  record,
  retryAt,
  onRate,
  onNavigate,
  onSpeak,
}) {
  const [clock, setClock] = useState(Date.now);
  const waiting = Math.max(0, Math.ceil(((retryAt || 0) - clock) / 1000));
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(timer);
  }, [retryAt]);
  const [revealed, setRevealed] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);

  useEffect(() => {
    const handleKey = (event) => {
      if (shouldIgnoreShortcut(event)) return;
      if (event.code === 'Space' && !event.target.closest('button')) {
        event.preventDefault();
        setRevealed((value) => !value);
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        onNavigate(event.key === 'ArrowLeft' ? -1 : 1);
      }
      if (revealed && !waiting && ['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault();
        onRate(RATINGS[Number(event.key) - 1]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [revealed, waiting, onNavigate, onRate]);

  return (
    <div className="flashcard-section">
      <article
        className={`flashcard ${revealed ? 'is-revealed' : ''}`}
        aria-labelledby="current-word"
      >
        <div className="card-topline">
          <span className="pill">
            <span className="tiny-dot" /> 英文 → 繁體中文
          </span>
          <span className="card-number">
            {String(index + 1).padStart(2, '0')} <span>/ {String(total).padStart(2, '0')}</span>
          </span>
        </div>
        <div className="word-content">
          <span className="word-prompt">
            {revealed ? '讓這個單字，留在你的記憶裡' : '先想一想，你還記得這個單字嗎？'}
          </span>
          <div className="word-heading">
            <h2 id="current-word" lang="en">
              {word.word}
            </h2>
            <IconButton label={`播放 ${word.word} 的英文發音`} onClick={() => onSpeak(word.word)}>
              <Volume2 size={21} />
            </IconButton>
          </div>
          {revealed ? (
            <div className="translation" aria-live="polite">
              <span className="translation-line" />
              <p>{word.translation}</p>
              <span className="answer-caption">
                {word.source === 'imported' ? '來自你的單字庫' : '記住了嗎？給自己一點回饋吧'}
              </span>
            </div>
          ) : (
            <button className="button reveal-button" onClick={() => setRevealed(true)}>
              <Eye size={18} /> 顯示答案 <kbd>Space</kbd>
            </button>
          )}
        </div>
        <div className="card-bottomline">
          <button
            className="ai-button"
            aria-expanded={examplesOpen}
            aria-controls="ai-example-panel"
            onClick={() => setExamplesOpen((value) => !value)}
          >
            <Sparkles size={16} /> AI 例句
          </button>
          <span className="card-hint">
            {record?.reviewCount ? (
              <>
                <Check size={14} /> 已複習 {record.reviewCount} 次
              </>
            ) : (
              <>
                <Lightbulb size={15} /> 先回想，再揭曉，記得更牢
              </>
            )}
          </span>
        </div>
      </article>
      {examplesOpen && (
        <ExamplePanel word={word} onSpeak={onSpeak} onClose={() => setExamplesOpen(false)} />
      )}
      {waiting > 0 && (
        <p className="retry-countdown" role="status">
          這張稍後再練：還有 {waiting} 秒。可以先切換其他單字。
        </p>
      )}
      <div className="rating-actions srs-rating-actions">
        {RATINGS.map((rating, index) => (
          <button
            key={rating}
            className={`button srs-rating ${rating}`}
            disabled={!revealed || waiting > 0}
            onClick={() => onRate(rating)}
          >
            <span>
              {RATING_LABELS[rating]}
              <span className="rating-subtitle">
                {nextReviewLabel(scheduleReview(record || newReview(word.id), rating))}
              </span>
            </span>
            <kbd>{index + 1}</kbd>
          </button>
        ))}
      </div>
      <div className="card-navigation">
        <button className="text-button" onClick={() => onNavigate(-1)} disabled={queueIndex === 0}>
          <ArrowLeft size={16} /> 上一張
        </button>
        <span>慢慢來，每一張都是進步。</span>
        <button
          className="text-button"
          onClick={() => onNavigate(1)}
          disabled={queueIndex >= queueLength - 1}
        >
          下一張 <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
