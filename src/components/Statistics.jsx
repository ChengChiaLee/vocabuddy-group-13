import { BarChart3, BookOpen, CalendarDays, Check, ClipboardCheck, RotateCcw } from 'lucide-react';
import { quizAccuracy, QUIZ_TYPES } from '../lib/quiz.js';
import { addDays, localDate } from '../lib/calendar.js';
import { reviewStats } from '../lib/srs.js';
import { EmptyState, ProgressBar } from './ui.jsx';

export default function Statistics({
  words,
  srs = {},
  practice = {},
  events = [],
  session,
  history,
  onLearn,
}) {
  const stats = reviewStats(words, srs, practice, events);
  const totals = history.reduce(
    (all, item) => ({ score: all.score + item.score, total: all.total + item.total }),
    { score: 0, total: 0 },
  );
  const metrics = [
    ['今日待複習', stats.due, '個單字'],
    ['今日已複習', stats.completed, '個單字'],
    ['學習中的單字', stats.learning, '個單字'],
    ['已熟悉單字', stats.familiar, '個單字'],
    [
      '測驗正確率',
      totals.total ? `${quizAccuracy(totals.score, totals.total)}%` : '—',
      totals.total ? `保留紀錄共 ${totals.total} 題` : '尚無完成的測驗',
    ],
    ['下次複習時間', stats.nextDue || '—', stats.nextDue ? '以本地日曆日安排' : '完成卡片後安排'],
  ];
  const today = localDate();
  const upcoming = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, index + 1);
    return { day, count: words.filter((word) => srs[word.id]?.dueAt === day).length };
  });
  const max = Math.max(1, ...upcoming.map((item) => item.count));
  return (
    <section className="statistics-section">
      <div className="dashboard-metrics">
        {metrics.map(([label, value, note]) => (
          <div className="dashboard-metric" key={label}>
            <span>{label}</span>
            <strong className={typeof value === 'string' && value.length > 5 ? 'date-value' : ''}>
              {value}
            </strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="statistics-card">
        <div className="section-heading">
          <div className="soft-icon">
            <BarChart3 size={21} />
          </div>
          <div>
            <h2>看見自己的每一點進步</h2>
            <p>熟悉來自多次成功回想，單次答對不等於完全掌握。</p>
          </div>
        </div>
        <div className="mastery-number">
          {quizAccuracy(stats.familiar, words.length)}
          <span>%</span>
          <small>單字熟悉比例</small>
        </div>
        <ProgressBar value={stats.familiar} total={words.length} label="單字熟悉比例" />
        <div className="statistics-breakdown">
          <div>
            <span className="legend-dot green" />
            <span>已熟悉</span>
            <strong>{stats.familiar}</strong>
          </div>
          <div>
            <span className="legend-dot amber" />
            <span>學習中</span>
            <strong>{stats.learning}</strong>
          </div>
          <div>
            <span className="legend-dot gray" />
            <span>新單字</span>
            <strong>{stats.newCards}</strong>
          </div>
        </div>
        <p className="statistics-note">
          已熟悉：至少連續 3 次成功回想，且間隔已達 14 天。今日共進行 {stats.reviews} 次卡片評分。
        </p>
      </div>
      <div className="daily-stat-card">
        <span className="pill">
          <BookOpen size={14} />
          本輪進度
        </span>
        <h3>
          {session.completedIds.length}
          <span> / {session.ids.length} 張</span>
        </h3>
        <p>
          {stats.overdue > 0
            ? `其中有 ${stats.overdue} 個單字已逾期，會優先安排。`
            : '每天多認識一個字，世界就多一點可能。'}
        </p>
        <button className="button primary" onClick={onLearn}>
          {session.complete ? '自由練習' : '繼續學習'}
          <Check size={17} />
        </button>
      </div>
      <section className="upcoming-card" aria-labelledby="upcoming-title">
        <div className="section-heading">
          <CalendarDays size={21} />
          <h2 id="upcoming-title">接下來七天，慢慢累積</h2>
        </div>
        <p className="statistics-note">依目前 SRS 排程計算；新單字與錯題加強不計入未來排程。</p>
        {upcoming.some((item) => item.count) ? (
          <div
            className="upcoming-chart"
            role="img"
            aria-label={upcoming.map((item) => `${item.day}：${item.count} 個單字`).join('；')}
          >
            {upcoming.map((item) => (
              <div className="upcoming-column" key={item.day}>
                <span>{item.count}</span>
                <div className="upcoming-bar-track">
                  <div style={{ height: `${(item.count / max) * 100}%` }} />
                </div>
                <small>{item.day.slice(5).replace('-', '/')}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="upcoming-empty">完成第一張卡片後，這裡就會出現真實的複習安排。</p>
        )}
      </section>
      <div className="history-card">
        <div className="section-heading">
          <ClipboardCheck size={21} />
          <h2>測驗紀錄</h2>
          <span className="muted">最近 {Math.min(history.length, 10)} 次</span>
        </div>
        {history.length ? (
          <div className="history-table">
            <div className="history-row history-head">
              <span>完成時間</span>
              <span>測驗模式</span>
              <span>答對題數</span>
              <span>正確率</span>
            </div>
            {history
              .slice(-10)
              .reverse()
              .map((item, index) => (
                <div className="history-row" key={item.id || `${item.date}-${index}`}>
                  <span>
                    {new Intl.DateTimeFormat('zh-TW', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(item.date))}
                  </span>
                  <span>{QUIZ_TYPES[item.type] || '四選一測驗'}</span>
                  <span>
                    {item.score} / {item.total}
                  </span>
                  <strong>{quizAccuracy(item.score, item.total)}%</strong>
                </div>
              ))}
          </div>
        ) : (
          <EmptyState icon={RotateCcw} title="第一份成績，等你寫下">
            完成任一測驗，就會在這裡留下真實的練習紀錄。
          </EmptyState>
        )}
      </div>
    </section>
  );
}
