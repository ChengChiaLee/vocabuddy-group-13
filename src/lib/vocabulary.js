export const wordId = (word) => word.trim().toLocaleLowerCase('en-US');

export function mergeVocabulary(defaults, imported = []) {
  const words = new Map(
    Object.entries(defaults).map(([word, translation]) => [
      wordId(word),
      { id: wordId(word), word, translation, source: 'default' },
    ]),
  );
  for (const item of imported) {
    if (typeof item?.word !== 'string' || typeof item?.translation !== 'string') continue;
    const word = item.word.trim();
    const translation = item.translation.trim();
    if (word && translation && !words.has(wordId(word))) {
      words.set(wordId(word), { id: wordId(word), word, translation, source: 'imported' });
    }
  }
  return [...words.values()];
}

export function parseImport(text, existing = []) {
  const seen = new Set(existing.map((item) => wordId(item.word)));
  const words = [];
  const errors = [];
  let duplicates = 0;
  text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const line = raw.trim();
      if (!line) return;
      const delimiter = line.search(/[,，\t]/);
      const word = delimiter < 0 ? '' : line.slice(0, delimiter).trim();
      const translation = delimiter < 0 ? '' : line.slice(delimiter + 1).trim();
      if (!word || !translation) {
        errors.push({ line: index + 1, raw, message: '請使用「英文,中文」格式，兩欄皆不可空白。' });
        return;
      }
      if (word.length > 120 || translation.length > 500) {
        errors.push({
          line: index + 1,
          raw,
          message: '英文請勿超過 120 字，翻譯請勿超過 500 字。',
        });
        return;
      }
      if (seen.has(wordId(word))) {
        duplicates += 1;
        return;
      }
      seen.add(wordId(word));
      words.push({ word, translation });
    });
  return { words, errors, duplicates };
}

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
