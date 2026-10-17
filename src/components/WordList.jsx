import { localDate } from '../lib/calendar.js';
import { reviewQueue, reviewCategory, nextReviewLabel, isFamiliar } from '../lib/srs.js';
import { BookOpen, Check, ChevronRight, RotateCcw, Search, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, IconButton } from './ui.jsx';

export default function WordList({
  words,
  progress,
  srs = {},
  practice = {},
  reviewOnly,
  onStudy,
  onSpeak,
  onImport,
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const source = reviewOnly ? reviewQueue(words, srs, practice, localDate(), 'review') : words;
  const statusFor = (id) =>
    isFamiliar(srs[id])
      ? 'known'
      : progress[id]?.status === 'known' && !srs[id]?.reviewCount
        ? 'legacy'
        : ['overdue', 'forgotten', 'due', 'practice'].includes(reviewCategory(id, srs, practice))
          ? 'review'
          : srs[id]?.reviewCount
            ? 'learning'
            : progress[id]?.status === 'known'
              ? 'legacy'
              : 'new';
  const filtered = source.filter((word) => {
    const matches = `${word.word} ${word.translation}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase());
    const status = statusFor(word.id);
    return matches && (filter === 'all' || filter === status);
  });
  return (
    <section className="word-list-section">
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={18} />
          <span className="sr-only">搜尋英文或中文單字</span>
          <input
            type="search"
            placeholder="搜尋英文或中文單字…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {!reviewOnly && (
          <label className="filter-field">
            <span className="sr-only">依學習狀態篩選</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">全部狀態</option>
              <option value="new">尚未學習</option>
              <option value="known">已熟悉</option>
              <option value="learning">學習中</option>
              <option value="legacy">舊版已記住</option>
              <option value="review">待複習</option>
            </select>
          </label>
        )}
      </div>
      <div className="list-caption">
        <span>共 {filtered.length} 個單字</span>
        {reviewOnly && source.length > 0 && (
          <button className="text-button" onClick={() => onStudy()}>
            開始複習 <ChevronRight size={16} />
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={reviewOnly ? RotateCcw : BookOpen}
          title={
            search || filter !== 'all'
              ? '沒有符合的單字'
              : reviewOnly
                ? '目前沒有待複習的單字'
                : '開始建立你的單字庫'
          }
          action={
            !search && !reviewOnly ? (
              <button className="button primary" onClick={onImport}>
                匯入單字
              </button>
            ) : null
          }
        >
          {search || filter !== 'all'
            ? '試試其他關鍵字，或調整篩選條件。'
            : reviewOnly
              ? '到期、逾期及需要加強練習的單字會出現在這裡。'
              : '匯入自己的單字，讓每次學習更貼近生活。'}
        </EmptyState>
      ) : (
        <div className="word-table">
          <div className="word-table-head">
            <span>英文單字 / 中文翻譯</span>
            <span>學習狀態</span>
            <span className="sr-only">操作</span>
          </div>
          {filtered.map((word) => {
            const status = statusFor(word.id);
            return (
              <div className="word-row" key={word.id}>
                <div className="word-row-main">
                  <span className="word-row-english" lang="en">
                    {word.word}
                  </span>
                  <span className="word-row-translation">
                    {word.translation}
                    {word.source === 'imported' && <span className="source-tag">自訂</span>}
                  </span>
                  <span className="word-next-review">
                    下次複習：{nextReviewLabel(srs[word.id])}
                  </span>
                </div>
                <span className={`status-tag ${status || 'new'}`}>
                  {status === 'known' ? (
                    <>
                      <Check size={13} /> 已熟悉
                    </>
                  ) : status === 'review' ? (
                    <>
                      <RotateCcw size={13} /> 待複習
                    </>
                  ) : status === 'learning' ? (
                    '學習中'
                  ) : status === 'legacy' ? (
                    '舊版已記住'
                  ) : (
                    '尚未學習'
                  )}
                </span>
                <div className="word-row-actions">
                  <IconButton
                    label={`播放 ${word.word} 的英文發音`}
                    onClick={() => onSpeak(word.word)}
                  >
                    <Volume2 size={17} />
                  </IconButton>
                  <IconButton label={`學習 ${word.word}`} onClick={() => onStudy(word.id)}>
                    <ChevronRight size={19} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
