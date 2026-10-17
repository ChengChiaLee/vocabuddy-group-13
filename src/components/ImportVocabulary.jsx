import { useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  BookOpen,
  CheckCircle2,
  FileText,
  Info,
  Trash2,
} from 'lucide-react';
import { parseImport } from '../lib/vocabulary.js';

export default function ImportVocabulary({ words, importedCount, onImport, onClear }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  function handleSubmit(event) {
    event.preventDefault();
    if (!text.trim()) {
      setResult({ words: [], errors: [], duplicates: 0, empty: true });
      return;
    }
    const parsed = parseImport(text, words);
    if (parsed.words.length) onImport(parsed.words);
    setResult(parsed);
    if (parsed.words.length || parsed.duplicates)
      setText(parsed.errors.map((error) => error.raw).join('\n'));
  }
  return (
    <section className="import-section">
      <div className="import-card">
        <div className="import-title-icon">
          <ArrowDownToLine size={24} />
        </div>
        <h2>匯入自己的單字庫</h2>
        <p className="muted">課堂筆記、閱讀生字，都能變成你的下一張單字卡。</p>
        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="vocabulary-input">
            貼上單字與中文翻譯<span>每行一個，以逗號分隔</span>
          </label>
          <textarea
            id="vocabulary-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'apple,蘋果\ngive up,放棄\nvocabulary,字彙'}
            rows={9}
            spellCheck={false}
            aria-describedby="import-format"
          />
          <div className="input-helper" id="import-format">
            <Info size={15} />
            <span>支援英文逗號、中文逗號或 Tab；空白行會自動略過。</span>
          </div>
          <button className="button primary import-submit" type="submit">
            <ArrowDownToLine size={17} /> 匯入單字
          </button>
        </form>
        {result && (
          <div className="import-result" role="status">
            {result.empty && (
              <p className="incorrect-text">
                <AlertCircle size={17} /> 請先貼上至少一組英文與中文翻譯。
              </p>
            )}
            {result.words.length > 0 && (
              <p className="correct-text">
                <CheckCircle2 size={17} /> 成功匯入 {result.words.length} 個單字！已加入你的單字庫。
              </p>
            )}
            {result.duplicates > 0 && (
              <p>
                <Info size={17} /> 已略過 {result.duplicates} 個重複單字，保留原有翻譯。
              </p>
            )}
            {result.errors.length > 0 && (
              <div className="import-errors">
                <strong>有 {result.errors.length} 行需要修改：</strong>
                <ul>
                  {result.errors.map((error) => (
                    <li key={error.line}>
                      第 {error.line} 行：{error.message}
                    </li>
                  ))}
                </ul>
                <p>其餘有效單字已匯入；需要修改的內容會保留在輸入框。</p>
              </div>
            )}
          </div>
        )}
      </div>
      <aside className="import-aside">
        <div className="info-card">
          <FileText size={23} />
          <h3>讓單字庫，更像你</h3>
          <p>片語、專有名詞也能加入。不論是考試重點，還是生活中遇見的字，都值得被記住。</p>
          <div className="format-example">
            <span>英文單字,中文翻譯</span>
            <code>take a break,休息一下</code>
          </div>
        </div>
        <div className="import-storage">
          <BookOpen size={20} />
          <div>
            <strong>我的自訂單字</strong>
            <p>已匯入 {importedCount} 個單字</p>
          </div>
          <button
            className="text-button danger"
            disabled={!importedCount}
            onClick={() => {
              onClear();
              setResult(null);
            }}
          >
            <Trash2 size={15} /> 清除匯入
          </button>
        </div>
        <p className="privacy-note">
          <Info size={14} /> 單字與進度只儲存在這個瀏覽器中。清除匯入後，原始單字庫仍會保留。
        </p>
      </aside>
    </section>
  );
}
