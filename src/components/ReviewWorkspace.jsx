import { BookOpen, GraduationCap, RotateCcw, Shuffle, Trophy } from 'lucide-react';
import Flashcard from './Flashcard.jsx';
import { EmptyState, ProgressBar } from './ui.jsx';

export default function ReviewWorkspace({
  words,
  session,
  srs,
  stats,
  onRate,
  onNavigate,
  onSpeak,
  onShuffle,
  onRestart,
  onQuiz,
  onImport,
}) {
  const word = words.find((item) => item.id === session.queue[session.index]);
  if (!words.length)
    return (
      <EmptyState
        icon={BookOpen}
        title="這裡還沒有單字"
        action={
          <button className="button primary" onClick={onImport}>
            匯入單字
          </button>
        }
      >
        加入新單字，開始今天的學習吧。
      </EmptyState>
    );
  if (!word || session.complete)
    return (
      <section className="summary-card" aria-labelledby="review-summary-title">
        <div className="summary-art">
          <Trophy size={40} strokeWidth={1.6} />
        </div>
        <span className="eyebrow">讓記憶有節奏，學習更輕鬆</span>
        <h2 id="review-summary-title">今天的待學單字，完成了！</h2>
        <p>目前沒有尚待完成的卡片。已安排的單字會在到期日再次出現。</p>
        <div className="summary-numbers">
          <div>
            <strong>{stats.completed}</strong>
            <span>今日完成單字</span>
          </div>
          <div>
            <strong>{stats.nextDue || '—'}</strong>
            <span>下次複習日期</span>
          </div>
        </div>
        <div className="summary-actions">
          <button className="button primary" onClick={onQuiz}>
            <GraduationCap size={18} /> 考我單詞
          </button>
          <button className="button secondary" onClick={() => onRestart('all')}>
            <RotateCcw size={16} /> 自由練習全部單字
          </button>
        </div>
        <p className="small-note">自由練習也會依你選擇的評分更新排程。</p>
      </section>
    );
  return (
    <div className="study-area">
      <div className="srs-session-counts" aria-label="今日複習摘要">
        <span>
          今日待複習 <strong>{stats.due}</strong>
        </span>
        <span>
          新單字 <strong>{stats.newCards}</strong>
        </span>
        <span>
          已完成 <strong>{stats.completed}</strong>
        </span>
      </div>
      <div className="learning-progress">
        <div>
          <span className="section-label">{session.scope === 'all' ? '自由練習' : '今日單字'}</span>
          <span className="progress-detail">
            本輪已完成 <strong>{session.completedIds.length}</strong> / {session.ids.length} 張
          </span>
        </div>
        <button className="text-button shuffle-button" onClick={onShuffle}>
          <Shuffle size={16} /> 打亂順序
        </button>
      </div>
      <ProgressBar
        value={session.completedIds.length}
        total={session.ids.length}
        label="今日單字學習進度"
      />
      <Flashcard
        key={`${word.id}:${session.revision}`}
        word={word}
        index={Math.max(0, session.ids.indexOf(word.id))}
        total={session.ids.length}
        queueIndex={session.index}
        queueLength={session.queue.length}
        record={srs[word.id]}
        retryAt={session.retryAt[word.id]}
        onRate={(rating) =>
          onRate({ wordId: word.id, rating, revision: session.revision, sessionId: session.id })
        }
        onNavigate={onNavigate}
        onSpeak={onSpeak}
      />
      <div className="keyboard-hints">
        <span>鍵盤小幫手</span>
        <span>
          <kbd>Space</kbd> 顯示答案
        </span>
        <span>
          <kbd>←</kbd>
          <kbd>→</kbd> 切換單字
        </span>
        <span>
          <kbd>1</kbd> 再來 <kbd>2</kbd> 困難 <kbd>3</kbd> 良好 <kbd>4</kbd> 簡單
        </span>
      </div>
    </div>
  );
}
