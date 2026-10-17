import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  BookMarked,
  BookOpen,
  Check,
  ChevronRight,
  GraduationCap,
  Layers,
  Leaf,
  Menu,
  RotateCcw,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Sprout,
  X,
} from 'lucide-react';
import defaultVocabulary from '../vocabularies.json';
import Quiz from './components/Quiz.jsx';
import WordList from './components/WordList.jsx';
import ImportVocabulary from './components/ImportVocabulary.jsx';
import Statistics from './components/Statistics.jsx';
import { IconButton } from './components/ui.jsx';
import { localDate } from './lib/calendar.js';
import { recordPractice, completeQuiz } from './lib/quiz.js';
import { speech } from './services/speech.js';
import {
  applyReview,
  createReviewSession,
  prepareReviewState,
  reconcileReviewSession,
  reviewStats,
} from './lib/srs.js';
import ReviewWorkspace from './components/ReviewWorkspace.jsx';
import { emptyState, loadState, saveState } from './lib/storage.js';
import { mergeVocabulary, shuffle } from './lib/vocabulary.js';

const navigation = [
  { id: 'learn', label: '單字學習', icon: Layers },
  { id: 'words', label: '我的單字庫', icon: BookMarked },
  { id: 'review', label: '待複習單字', icon: RotateCcw },
  { id: 'stats', label: '學習紀錄', icon: BarChart3 },
];
const titles = {
  learn: ['YTP VocaBuddy', '每天一點，讓單字成為你的日常。'],
  words: ['我的單字庫', '每個遇見的單字，都值得好好收藏。'],
  review: ['待複習單字', '忘記很正常，再遇見一次就更熟悉。'],
  stats: ['學習紀錄', '你走的每一步，都在這裡留下痕跡。'],
  import: ['讓學習，從你的生活開始', '帶上自己的單字，開啟下一段學習旅程。'],
};

function initialize() {
  let loaded;
  try {
    loaded = loadState(window.localStorage);
  } catch {
    loaded = { state: emptyState(), error: '瀏覽器暫時無法儲存進度，本次仍可正常學習。' };
  }
  const words = mergeVocabulary(defaultVocabulary, loaded.state.imported);
  return {
    ...loaded,
    state: {
      ...loaded.state,
      ...prepareReviewState(loaded.state, words),
    },
  };
}

export default function App() {
  const [initial] = useState(initialize);
  const [data, setData] = useState(initial.state);
  const [storageError, setStorageError] = useState('');
  const [view, setView] = useState('learn');
  const [mode, setMode] = useState('flashcards');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const navigationRef = useRef(null);
  const [notice, setNotice] = useState(initial.error);
  const [day, setDay] = useState(localDate);
  const words = useMemo(() => mergeVocabulary(defaultVocabulary, data.imported), [data.imported]);
  const stats = reviewStats(words, data.srs, data.practice, data.reviewEvents);
  const known = stats.familiar;
  const review = stats.due;
  const importedCount = words.filter((word) => word.source === 'imported').length;
  const session = data.reviewSession;
  const ratingLock = useRef(0);

  useEffect(() => {
    let error;
    try {
      error = saveState(window.localStorage, data);
    } catch {
      error = '瀏覽器暫時無法儲存進度；請保留此分頁，以繼續本次學習。';
    }
    setStorageError(error);
  }, [data]);
  useEffect(() => {
    const checkDate = () => setDay(localDate());
    const timer = setInterval(checkDate, 60000);
    window.addEventListener('focus', checkDate);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', checkDate);
    };
  }, []);
  useEffect(() => {
    setData((previous) => ({
      ...previous,
      ...prepareReviewState(previous, words),
    }));
  }, [words, day]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const onChange = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileOpen(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    navigationRef.current?.querySelector('button')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      document.querySelector('.menu-button')?.focus();
    };
  }, [mobileOpen]);

  function navigate(nextView) {
    speech.cancel();
    setView(nextView);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const rate = useCallback((action) => {
    const now = new Date();
    if (now.getTime() < ratingLock.current) return;
    ratingLock.current = now.getTime() + 350;
    speech.cancel();
    setData((previous) => applyReview(previous, action, now));
  }, []);
  const navigateCard = useCallback((direction) => {
    speech.cancel();
    return setData((previous) => ({
      ...previous,
      reviewSession: {
        ...previous.reviewSession,
        index: Math.max(
          0,
          Math.min(
            previous.reviewSession.queue.length - 1,
            previous.reviewSession.index + direction,
          ),
        ),
        revision: previous.reviewSession.revision + 1,
      },
    }));
  }, []);
  function startStudy(id, reviewOnly = false) {
    setData((previous) => {
      const scope = id
        ? 'all'
        : reviewOnly
          ? 'review'
          : previous.reviewSession.complete
            ? 'all'
            : 'due';
      let next =
        id || reviewOnly || previous.reviewSession.complete
          ? createReviewSession(words, previous.srs, previous.practice, new Date(), scope)
          : previous.reviewSession;
      if (id) next = { ...next, index: Math.max(0, next.queue.indexOf(id)) };
      return { ...previous, reviewSession: next };
    });
    setMode('flashcards');
    navigate('learn');
  }
  function restartStudy(scope = 'due') {
    setData((previous) => ({
      ...previous,
      reviewSession: createReviewSession(words, previous.srs, previous.practice, new Date(), scope),
    }));
  }
  function shuffleCards() {
    setData((previous) => {
      const queue = shuffle(previous.reviewSession.queue);
      const ready = queue.findIndex(
        (id) => (previous.reviewSession.retryAt[id] || 0) <= Date.now(),
      );
      return {
        ...previous,
        reviewSession: {
          ...previous.reviewSession,
          queue,
          index: Math.max(0, ready),
          revision: previous.reviewSession.revision + 1,
        },
      };
    });
    setNotice('已打亂尚未完成的單字，排程與重練等待時間保持不變。');
  }
  function importWords(imported) {
    setData((previous) => ({ ...previous, imported: [...previous.imported, ...imported] }));
  }
  function clearImported() {
    const defaults = mergeVocabulary(defaultVocabulary);
    const valid = new Set(defaults.map((word) => word.id));
    setData((previous) => {
      const progress = Object.fromEntries(
        Object.entries(previous.progress).filter(([id]) => valid.has(id)),
      );
      const srs = Object.fromEntries(Object.entries(previous.srs).filter(([id]) => valid.has(id)));
      const practice = Object.fromEntries(
        Object.entries(previous.practice).filter(([id]) => valid.has(id)),
      );
      return {
        ...previous,
        imported: [],
        progress,
        srs,
        practice,
        activeQuiz: null,
        reviewSession: reconcileReviewSession(previous.reviewSession, defaults, srs, practice),
      };
    });
    setNotice('已清除自訂單字，原始單字與其進度都已保留。');
  }
  function speak(word) {
    speech.play(word, { onError: setNotice });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳至主要內容
      </a>
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="關閉導覽選單"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        ref={navigationRef}
        inert={isMobile && !mobileOpen}
        className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        id="main-navigation"
      >
        <button
          className="brand"
          onClick={() => navigate('learn')}
          aria-label="VocaBuddy 你的日常單字夥伴，回到首頁"
        >
          <span className="brand-mark">
            <BookOpen size={25} strokeWidth={1.8} />
          </span>
          <span>
            Voca<span className="brand-light">Buddy</span>
            <small>你的日常單字夥伴</small>
          </span>
        </button>
        <div className="nav-section-label">我的學習空間</div>
        <nav aria-label="主要導覽">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${view === id ? 'active' : ''}`}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {id === 'review' && review > 0 ? (
                <span className="nav-badge">{review}</span>
              ) : view === id ? (
                <span className="nav-active-dot" />
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <button
          className={`nav-item import-nav ${view === 'import' ? 'active' : ''}`}
          aria-current={view === 'import' ? 'page' : undefined}
          onClick={() => navigate('import')}
        >
          <ArrowDownToLine size={19} strokeWidth={1.8} />
          <span>匯入單字庫</span>
          <span className="nav-plus">＋</span>
        </button>
        <div className="sidebar-bottom">
          <div className="growth-note">
            <div className="growth-illustration" aria-hidden="true">
              <span className="growth-orbit" />
              <Sprout size={42} strokeWidth={1.4} />
              <span className="growth-sparkle">✦</span>
            </div>
            <strong>小小累積，大大進步。</strong>
            <p>
              每天給自己幾分鐘，
              <br />
              讓英文一點一滴成長。
            </p>
            <span className="growth-line" />
          </div>
          <div className="sidebar-footer">
            <span className="status-dot" /> 你的學習，隨時接續
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={isMobile && mobileOpen}>
        <header className="topbar">
          <div className="breadcrumb">
            <IconButton
              label={mobileOpen ? '關閉導覽選單' : '開啟導覽選單'}
              className="menu-button"
              aria-expanded={mobileOpen}
              aria-controls="main-navigation"
              onClick={() => setMobileOpen((value) => !value)}
            >
              <Menu size={21} />
            </IconButton>
            <span>我的學習空間</span>
            <ChevronRight size={14} />
            <strong>
              {view === 'import'
                ? '匯入單字庫'
                : navigation.find((item) => item.id === view)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <span className={`save-status ${storageError ? 'save-error' : ''}`}>
              <ShieldCheck size={16} />
              {storageError ? '暫時無法儲存' : '進度已儲存'}
            </span>
            <span className="topbar-divider" />
            <span className="avatar" aria-label="學習者">
              學
            </span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">
                <span className="tiny-dot" /> 為今天的自己，多記住一個字
              </div>
              <h1>
                {titles[view][0]}
                {view === 'learn' && (
                  <span className="title-leaf" aria-hidden="true">
                    <Leaf size={29} strokeWidth={1.4} />
                  </span>
                )}
              </h1>
              <p>{titles[view][1]}</p>
            </div>
            {view !== 'import' && (
              <button className="button heading-import" onClick={() => navigate('import')}>
                <ArrowDownToLine size={17} /> 匯入單字
              </button>
            )}
          </div>
          {storageError && (
            <div className="storage-warning" role="status">
              <ShieldCheck size={18} /> {storageError}
            </div>
          )}
          {view === 'learn' && (
            <>
              <div className="stats-row">
                <div className="stat-card">
                  <span className="stat-icon total">
                    <BookOpen size={22} strokeWidth={1.8} />
                  </span>
                  <div>
                    <span className="stat-label">單字庫總數</span>
                    <div>
                      <strong>{words.length}</strong>
                      <span className="stat-unit">個單字</span>
                    </div>
                  </div>
                  <span className="stat-note">持續累積中</span>
                </div>
                <div className="stat-card">
                  <span className="stat-icon mastered">
                    <Check size={23} />
                  </span>
                  <div>
                    <span className="stat-label">已熟悉單字</span>
                    <div>
                      <strong>{known}</strong>
                      <span className="stat-unit">個單字</span>
                    </div>
                  </div>
                  <span
                    className="mini-ring"
                    role="img"
                    style={{ '--progress': `${words.length ? (known / words.length) * 100 : 0}%` }}
                    aria-label={`已掌握 ${words.length ? Math.round((known / words.length) * 100) : 0}%`}
                  />
                </div>
                <button className="stat-card stat-review" onClick={() => navigate('review')}>
                  <span className="stat-icon review">
                    <RotateCcw size={21} />
                  </span>
                  <div>
                    <span className="stat-label">今日待複習</span>
                    <div>
                      <strong>{review}</strong>
                      <span className="stat-unit">個單字</span>
                    </div>
                  </div>
                  <ChevronRight size={17} className="stat-chevron" />
                </button>
              </div>
              <div className="learning-workspace">
                <div className="workspace-toolbar">
                  <div className="mode-tabs" role="group" aria-label="學習模式">
                    <button
                      className={mode === 'flashcards' ? 'selected' : ''}
                      aria-pressed={mode === 'flashcards'}
                      onClick={() => setMode('flashcards')}
                    >
                      <Layers size={17} /> 單字卡學習
                    </button>
                    <button
                      className={mode === 'quiz' ? 'selected' : ''}
                      aria-pressed={mode === 'quiz'}
                      onClick={() => setMode('quiz')}
                    >
                      <GraduationCap size={19} /> 考我單詞
                    </button>
                  </div>
                  <span className="workspace-note">
                    <Sparkles size={15} /> 讓每一次練習，都更有收穫
                  </span>
                </div>
                {mode === 'flashcards' ? (
                  <ReviewWorkspace
                    words={words}
                    session={session}
                    srs={data.srs}
                    stats={stats}
                    onRate={rate}
                    onNavigate={navigateCard}
                    onSpeak={speak}
                    onShuffle={shuffleCards}
                    onRestart={restartStudy}
                    onQuiz={() => setMode('quiz')}
                    onImport={() => navigate('import')}
                  />
                ) : (
                  <Quiz
                    vocabulary={words}
                    srs={data.srs}
                    practice={data.practice}
                    activeQuiz={data.activeQuiz}
                    onRunChange={(run) => setData((previous) => ({ ...previous, activeQuiz: run }))}
                    onAnswer={(answer) =>
                      setData((previous) => {
                        const next = recordPractice(previous, answer);
                        return {
                          ...next,
                          reviewSession: reconcileReviewSession(
                            next.reviewSession,
                            words,
                            next.srs,
                            next.practice,
                          ),
                        };
                      })
                    }
                    onComplete={(run) => setData((previous) => completeQuiz(previous, run))}
                    onSpeak={speak}
                    onLearn={() => setMode('flashcards')}
                  />
                )}
              </div>
              <div className="daily-tip">
                <span className="tip-icon">
                  <Sprout size={21} />
                </span>
                <p>
                  <strong>記憶的小祕訣</strong>{' '}
                  依回想難度選擇四種評分。到期與逾期單字會優先出現，測驗錯題也可加入練習。
                </p>
                <Leaf size={34} strokeWidth={1.1} className="tip-leaf" />
              </div>
            </>
          )}
          {(view === 'words' || view === 'review') && (
            <WordList
              key={view}
              words={words}
              progress={data.progress}
              srs={data.srs}
              practice={data.practice}
              reviewOnly={view === 'review'}
              onStudy={(id) => startStudy(id, view === 'review')}
              onSpeak={speak}
              onImport={() => navigate('import')}
            />
          )}
          {view === 'import' && (
            <ImportVocabulary
              words={words}
              importedCount={importedCount}
              onImport={importWords}
              onClear={clearImported}
            />
          )}
          {view === 'stats' && (
            <Statistics
              words={words}
              progress={data.progress}
              session={session}
              history={data.quizHistory}
              srs={data.srs}
              practice={data.practice}
              events={data.reviewEvents}
              onLearn={() => startStudy()}
            />
          )}
          <footer className="main-footer">
            <span>
              <BookOpen size={14} /> VocaBuddy <span className="footer-dot">·</span>{' '}
              你的每一步，都算進步。
            </span>
            <span>
              為好奇心，留一點時間 <Leaf size={13} />
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{notice}</span>
          <IconButton label="關閉提示" onClick={() => setNotice('')}>
            <X size={16} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
