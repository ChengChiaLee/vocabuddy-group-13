import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  GraduationCap,
  Headphones,
  Keyboard,
  RotateCcw,
  Trophy,
  Volume2,
  X,
} from 'lucide-react';
import {
  createQuizRun,
  submitQuizAnswer,
  advanceQuiz,
  restoreQuizRun,
  questionCounts,
  QUIZ_TYPES,
  quizAccuracy,
} from '../lib/quiz.js';
import { reviewQueue } from '../lib/srs.js';
import { localDate } from '../lib/calendar.js';
import alternatives from '../data/alternative-spellings.json';
import { speech } from '../services/speech.js';
import { EmptyState, IconButton, ProgressBar, shouldIgnoreShortcut } from './ui.jsx';

const modes = [
  { type: 'multiple', icon: ClipboardCheck, description: '看英文、選中文，用熟悉的四選一暖暖身。' },
  { type: 'spelling', icon: Keyboard, description: '從中文意思回想完整英文，讓記憶更扎實。' },
  { type: 'listening', icon: Headphones, description: '聽英文發音，再寫出單字或完整片語。' },
];
export default function Quiz({
  vocabulary,
  srs = {},
  practice = {},
  activeQuiz,
  onRunChange,
  onAnswer,
  onComplete,
  onSpeak,
  onLearn,
}) {
  const [run, setRun] = useState(() => restoreQuizRun(activeQuiz, vocabulary));
  const runRef = useRef(run);
  const [selection, setSelection] = useState(!run);
  const [scope, setScope] = useState('all');
  const [count, setCount] = useState(
    vocabulary.length >= 10 ? '10' : vocabulary.length >= 5 ? '5' : 'all',
  );
  const [randomized, setRandomized] = useState(true);
  const [answerText, setAnswerText] = useState('');
  const [inputError, setInputError] = useState('');
  const [rate, setRate] = useState(0.85);
  const [audioStatus, setAudioStatus] = useState('');
  const [audioError, setAudioError] = useState('');
  const inputRef = useRef(null);
  const reviewWords = reviewQueue(vocabulary, srs, practice, localDate(), 'review');
  const pool = scope === 'review' ? reviewWords : vocabulary;
  const counts = questionCounts(pool.length);
  const question = run?.questions[run.index];
  const submitted = run?.answers[run.index];
  function commit(next) {
    runRef.current = next;
    setRun(next);
    onRunChange(next);
  }
  function play(value = runRef.current) {
    if (!value || value.type !== 'listening' || value.done) return;
    setAudioError('');
    setAudioStatus('準備播放英文…');
    speech.play(value.questions[value.index].word, {
      rate,
      onStatus: setAudioStatus,
      onError: setAudioError,
    });
  }
  function start(type, options = {}) {
    speech.cancel();
    const source = (options.scope || scope) === 'review' ? reviewWords : vocabulary;
    const next = createQuizRun(source, {
      type,
      count: options.count || count,
      randomized: options.randomized ?? randomized,
      scope: options.scope || scope,
      alternatives,
    });
    commit(next);
    setSelection(false);
    setAnswerText('');
    setInputError('');
    setAudioError('');
    setAudioStatus('');
  }
  function answer(raw) {
    const current = runRef.current;
    if (!current || current.done) return;
    if (!raw.trim()) {
      setInputError('請先輸入英文答案，再送出。');
      inputRef.current?.focus();
      return;
    }
    const next = submitQuizAnswer(current, raw);
    if (next === current) return;
    speech.cancel();
    if (current.type === 'listening') setAudioStatus('本題已作答，可以重新播放。');
    setInputError('');
    commit(next);
    onAnswer(next.answers.at(-1));
  }
  function nextQuestion() {
    const current = runRef.current;
    if (!current) return;
    const next = advanceQuiz(current);
    if (next === current) return;
    speech.cancel();
    commit(next);
    setAnswerText('');
    setInputError('');
    setAudioError('');
    setAudioStatus('');
    if (next.done) onComplete(next);
  }
  useEffect(() => {
    if (selection || !run || run.done) return;
    if (run.type !== 'multiple') inputRef.current?.focus();
    if (run.type === 'listening' && !run.answers[run.index]) play(run);
    return () => speech.cancel();
  }, [run?.id, run?.index, selection]);
  useEffect(() => {
    const handleKey = (event) => {
      if (shouldIgnoreShortcut(event) || selection || !runRef.current || runRef.current.done)
        return;
      const current = runRef.current;
      if (current.type === 'multiple' && !current.answers[current.index]) {
        const option = 'abcd'.indexOf(event.key.toLowerCase()),
          digit = '1234'.indexOf(event.key);
        const choice = option >= 0 ? option : digit;
        if (choice >= 0 && choice < current.questions[current.index].options.length) {
          event.preventDefault();
          answer(current.questions[current.index].options[choice]);
        }
      }
      if (
        event.key === 'Enter' &&
        current.answers[current.index] &&
        !event.target.closest('button')
      ) {
        event.preventDefault();
        nextQuestion();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selection]);

  if (selection)
    return (
      <section className="quiz-selection" aria-labelledby="quiz-selection-title">
        <div className="quiz-selection-heading">
          <h2 id="quiz-selection-title">今天，想怎麼練習？</h2>
          <p>從理解到拼寫，找到適合自己的學習節奏。</p>
        </div>
        {run && !run.done && (
          <button className="button secondary resume-quiz" onClick={() => setSelection(false)}>
            繼續上次的{QUIZ_TYPES[run.type]} <ArrowRight size={16} />
          </button>
        )}
        <div className="quiz-settings">
          <label>
            單字範圍
            <select
              value={scope}
              onChange={(event) => {
                const value = event.target.value;
                setScope(value);
                const length = value === 'review' ? reviewWords.length : vocabulary.length;
                setCount(length >= 10 ? '10' : length >= 5 ? '5' : 'all');
              }}
            >
              <option value="all">整個單字庫（{vocabulary.length} 個）</option>
              <option value="review">待複習與加強練習（{reviewWords.length} 個）</option>
            </select>
          </label>
          <label>
            測驗題數
            <select
              value={count}
              onChange={(event) => setCount(event.target.value)}
              disabled={!pool.length}
            >
              {counts.map((value) => (
                <option key={value} value={String(value)}>
                  {value === 'all' ? `全部（${pool.length} 題）` : `${value} 題`}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={randomized}
              onChange={(event) => setRandomized(event.target.checked)}
            />
            隨機題目順序
          </label>
        </div>
        {!pool.length ? (
          <EmptyState icon={GraduationCap} title="這個範圍暫時沒有單字">
            可以切換至整個單字庫，或先匯入新單字。
          </EmptyState>
        ) : (
          <div className="quiz-mode-cards">
            {modes.map(({ type, icon: Icon, description }) => (
              <article className="quiz-mode-card" key={type}>
                <div className="soft-icon">
                  <Icon size={23} />
                </div>
                <h3>{QUIZ_TYPES[type]}</h3>
                <p>{description}</p>
                <button
                  className="button secondary"
                  onClick={() => start(type)}
                  disabled={type === 'listening' && !speech.available()}
                >
                  開始{QUIZ_TYPES[type]} <ArrowRight size={15} />
                </button>
                {type === 'listening' && !speech.available() && (
                  <p className="error-message">此瀏覽器不支援語音，請選擇其他模式。</p>
                )}
              </article>
            ))}
          </div>
        )}
        <p className="quiz-policy">
          測驗只紀錄練習表現；答錯加入加強清單，不會自動改動 SRS 複習間隔。
        </p>
      </section>
    );
  if (!run || !run.questions.length)
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="還沒有可以測驗的單字"
        action={
          <button className="button secondary" onClick={() => setSelection(true)}>
            選擇其他範圍
          </button>
        }
      >
        請調整測驗範圍，或先匯入單字。
      </EmptyState>
    );
  if (run.done)
    return (
      <section className="summary-card quiz-summary" aria-labelledby="quiz-result">
        <div className="summary-art">
          <Trophy size={40} strokeWidth={1.6} />
        </div>
        <span className="eyebrow">
          {QUIZ_TYPES[run.type]} · 共 {run.questions.length} 題
        </span>
        <h2 id="quiz-result">測驗完成，做得好！</h2>
        <div className="score-display">
          {quizAccuracy(run.score, run.questions.length)}
          <span>%</span>
        </div>
        <div className="quiz-result-counts">
          <span>
            答對 <strong>{run.score}</strong> 題
          </span>
          <span>
            答錯 <strong>{run.questions.length - run.score}</strong> 題
          </span>
        </div>
        <p>
          {run.score === run.questions.length
            ? '全部答對，繼續保持！'
            : '錯題已加入加強練習清單，原有 SRS 排程保持不變。'}
        </p>
        <div className="summary-actions">
          <button
            className="button primary"
            onClick={() =>
              start(run.type, {
                count: run.questions.length,
                scope: run.scope,
                randomized: run.randomized,
              })
            }
          >
            <RotateCcw size={17} />
            重新測驗
          </button>
          <button className="button secondary" onClick={onLearn}>
            回到單字卡
          </button>
          <button className="text-button" onClick={() => setSelection(true)}>
            選擇其他測驗
          </button>
        </div>
        {run.answers.some((item) => !item.correct) && (
          <div className="quiz-mistakes">
            <h3>再看一眼，加深印象</h3>
            {run.answers
              .filter((item) => !item.correct)
              .map((item) => (
                <div key={item.attemptId}>
                  <div>
                    <span lang="en">{item.word}</span>
                    <small>你的答案：{item.answer}</small>
                  </div>
                  <strong>{item.translation}</strong>
                </div>
              ))}
          </div>
        )}
      </section>
    );
  if (run.type === 'listening' && !speech.available())
    return (
      <EmptyState
        icon={Headphones}
        title="這個瀏覽器暫不支援聽力播放"
        action={
          <button className="button primary" onClick={() => start('spelling')}>
            改用拼字測驗
          </button>
        }
      >
        你的單字與進度都還在，也可以使用四選一模式。
      </EmptyState>
    );
  return (
    <section className="quiz-section" aria-labelledby="quiz-word">
      <div className="learning-progress">
        <div>
          <span className="section-label">{QUIZ_TYPES[run.type]}</span>
          <span className="progress-detail">
            第 <strong>{run.index + 1}</strong> / {run.questions.length} 題
          </span>
        </div>
        <button
          className="text-button"
          onClick={() => {
            speech.cancel();
            setSelection(true);
          }}
        >
          選擇模式
        </button>
      </div>
      <ProgressBar value={run.answers.length} total={run.questions.length} label="測驗進度" />
      <article className="quiz-card">
        <div className="card-topline">
          <span className="pill">
            <ClipboardCheck size={14} />
            {run.type === 'multiple'
              ? '選出正確的中文翻譯'
              : run.type === 'spelling'
                ? '看中文，寫出完整英文'
                : '聽英文，寫出完整單字或片語'}
          </span>
          <span className="muted">已答對 {run.score} 題</span>
        </div>
        <div className={`quiz-word ${run.type === 'listening' ? 'listening-heading' : ''}`}>
          <h2 id="quiz-word" lang={run.type === 'multiple' ? 'en' : 'zh-Hant'}>
            {run.type === 'multiple'
              ? question.word
              : run.type === 'spelling'
                ? question.translation
                : '仔細聽，再把單字寫下來'}
          </h2>
          {run.type === 'multiple' && (
            <IconButton label="播放本題英文發音" onClick={() => onSpeak(question.word)}>
              <Volume2 size={20} />
            </IconButton>
          )}
        </div>
        {run.type === 'listening' && (
          <div className="listening-controls">
            <button className="button secondary" onClick={() => play()}>
              <Volume2 size={20} />
              播放／重新播放
            </button>
            <label>
              播放速度
              <select
                value={rate}
                onChange={(event) => {
                  speech.cancel();
                  setRate(Number(event.target.value));
                  setAudioStatus('速度已調整，可以重新播放。');
                }}
              >
                <option value="0.65">較慢 · 0.65 倍</option>
                <option value="0.85">慢速 · 0.85 倍</option>
                <option value="1">正常 · 1 倍</option>
                <option value="1.15">稍快 · 1.15 倍</option>
              </select>
            </label>
            <p className={audioError ? 'error-message' : 'audio-status'} role="status">
              {audioError || audioStatus}
            </p>
            {audioError && (
              <button className="text-button" onClick={() => start('spelling')}>
                改用拼字測驗
              </button>
            )}
          </div>
        )}
        {run.type === 'multiple' ? (
          <div className="quiz-options">
            {question.options.map((option, index) => {
              const correct = Boolean(submitted) && option === question.translation;
              const wrong = submitted?.answer === option && !correct;
              return (
                <button
                  key={option}
                  className={`quiz-option ${correct ? 'correct' : ''} ${wrong ? 'incorrect' : ''}`}
                  disabled={Boolean(submitted)}
                  onClick={() => answer(option)}
                >
                  <span className="option-letter">{'ABCD'[index]}</span>
                  <span>{option}</span>
                  {correct ? (
                    <Check size={20} aria-label="正確答案" />
                  ) : wrong ? (
                    <X size={20} aria-label="答錯" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <form
            className="spelling-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitted ? nextQuestion() : answer(answerText);
            }}
          >
            <label htmlFor="quiz-answer">
              {run.type === 'listening' ? '英文聽寫答案' : '本題英文拼字'}
            </label>
            <div className="spelling-input-row">
              <input
                ref={inputRef}
                id="quiz-answer"
                value={answerText}
                onChange={(event) => setAnswerText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing && submitted) {
                    event.preventDefault();
                    nextQuestion();
                  }
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={200}
                readOnly={Boolean(submitted)}
                aria-invalid={Boolean(inputError)}
                aria-describedby={inputError ? 'quiz-input-error' : undefined}
                placeholder="輸入完整英文單字或片語"
              />
              <button className="button primary" type="submit" disabled={Boolean(submitted)}>
                {submitted ? '已送出答案' : '送出答案'}
                <ArrowRight size={16} />
              </button>
            </div>
            {inputError && (
              <p id="quiz-input-error" role="alert" className="error-message">
                {inputError}
              </p>
            )}
            <p className="small-note">忽略大小寫與多餘空白；片語需完整作答。</p>
          </form>
        )}
        <div className="quiz-feedback" aria-live="polite">
          {submitted ? (
            <>
              <div>
                <span className={submitted.correct ? 'correct-text' : 'incorrect-text'}>
                  {submitted.correct ? '答對了！又多記住一點。' : '再接再厲，這個字值得再練一次。'}
                </span>
                {run.type !== 'multiple' && (
                  <p className="spelling-correct-answer">
                    正確拼字：<strong lang="en">{question.word}</strong>
                    <IconButton label="播放正確答案發音" onClick={() => onSpeak(question.word)}>
                      <Volume2 size={16} />
                    </IconButton>
                  </p>
                )}
                {run.type === 'multiple' && !submitted.correct && (
                  <p>正確答案：{question.translation}</p>
                )}
              </div>
              <button className="button primary" onClick={nextQuestion}>
                {run.index === run.questions.length - 1 ? '查看成績' : '下一題'}
                <ArrowRight size={17} />
              </button>
            </>
          ) : (
            <span className="muted">
              {run.type === 'multiple' ? '選擇答案，或按鍵盤 A–D 作答' : '輸入答案後按 Enter 送出'}
            </span>
          )}
        </div>
      </article>
      <p className="quiz-policy">答錯會加入加強練習；測驗不會自動更改複習日期。</p>
    </section>
  );
}
