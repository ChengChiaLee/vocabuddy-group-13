import { useEffect, useRef, useState } from 'react';
import { Copy, LoaderCircle, RotateCcw, Sparkles, Volume2, X } from 'lucide-react';
import { CONTEXTS, DIFFICULTIES } from '../lib/example-contract.js';
import { getExample, getExampleStatus } from '../services/examples.js';
import { IconButton } from './ui.jsx';

export default function ExamplePanel({ word, onSpeak, onClose }) {
  const [context, setContext] = useState('everyday');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [service, setService] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const active = useRef(null);
  const serial = useRef(0);
  useEffect(() => {
    let alive = true;
    getExampleStatus().then((value) => {
      if (alive) setService(value);
    });
    return () => {
      alive = false;
      serial.current++;
      active.current?.abort();
    };
  }, []);
  useEffect(() => {
    generate(false);
    return () => active.current?.abort();
  }, []);
  function change(setter, value) {
    serial.current++;
    active.current?.abort();
    setLoading(false);
    setter(value);
    setResult(null);
    setCopyMessage('');
  }
  async function generate(regenerate = false) {
    active.current?.abort();
    active.current = new AbortController();
    const signal = active.current.signal;
    const requestId = ++serial.current;
    setLoading(true);
    setCopyMessage('');
    try {
      const value = await getExample(
        { wordId: word.id, word: word.word, translation: word.translation, context, difficulty },
        { regenerate, signal },
      );
      if (requestId === serial.current && !signal.aborted) setResult(value);
    } catch (error) {
      if (!signal.aborted && requestId === serial.current) setResult({ error: error.message });
    } finally {
      if (requestId === serial.current) setLoading(false);
    }
  }
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw Error();
      await navigator.clipboard.writeText(
        `${result.english}\n${result.translation}\n${result.explanation}`,
      );
      setCopyMessage('已複製例句與翻譯。');
    } catch {
      setCopyMessage('目前無法複製，請選取例句文字後手動複製。');
    }
  }
  return (
    <section className="example-panel" id="ai-example-panel" aria-labelledby="ai-example-title">
      <div className="example-panel-heading">
        <Sparkles size={18} />
        <h3 id="ai-example-title">讓單字走進情境</h3>
        <IconButton label="收合 AI 例句" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </div>
      <div className="example-controls">
        <label>
          使用情境
          <select value={context} onChange={(e) => change(setContext, e.target.value)}>
            {Object.entries(CONTEXTS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          英文難度
          <select value={difficulty} onChange={(e) => change(setDifficulty, e.target.value)}>
            {Object.entries(DIFFICULTIES).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary" disabled={loading} onClick={() => generate(false)}>
          {loading ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{' '}
          {loading ? '取得例句中…' : service?.available ? '取得例句' : '讀取快取例句'}
        </button>
      </div>
      <div className="example-content" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <p className="example-message">正在準備符合情境的例句…</p>
        ) : result?.unavailable ? (
          <div className="example-message">
            <strong>{result.offline ? '目前離線，這組設定尚無快取例句' : 'AI 例句，準備中'}</strong>
            <p>目前尚未連接可用的 AI 服務。你可以繼續學習，已快取的例句仍可閱讀。</p>
          </div>
        ) : result?.error ? (
          <div className="example-message error-message">
            <p>{result.error}</p>
            <button className="text-button" onClick={() => generate(false)}>
              <RotateCcw size={15} />
              重試
            </button>
          </div>
        ) : result?.english ? (
          <>
            <div className="example-english">
              <p lang="en">{result.english}</p>
              <IconButton label="播放英文例句" onClick={() => onSpeak(result.english)}>
                <Volume2 size={19} />
              </IconButton>
            </div>
            <p className="example-translation">{result.translation}</p>
            <div className="example-explanation">
              <strong>用法小筆記</strong>
              <p>{result.explanation}</p>
              {result.notes.length > 0 && (
                <ul>
                  {result.notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="example-actions">
              <span>{result.cached ? '已快取，可離線閱讀' : 'AI 產生 · 已儲存至本機快取'}</span>
              <button className="text-button" onClick={copy}>
                <Copy size={15} />
                複製例句
              </button>
              {service?.available && (
                <button className="text-button" disabled={loading} onClick={() => generate(true)}>
                  <RotateCcw size={15} />
                  重新產生
                </button>
              )}
            </div>
            {result.cacheWarning && <p className="error-message">{result.cacheWarning}</p>}
          </>
        ) : (
          <p className="example-message">選擇情境與難度，再取得適合你的例句。</p>
        )}
      </div>
      {copyMessage && (
        <p className="example-copy-status" role="status">
          {copyMessage}
        </p>
      )}
    </section>
  );
}
