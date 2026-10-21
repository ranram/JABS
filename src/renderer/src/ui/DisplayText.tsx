import './displayText.css';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const cjkCharacters = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const otherScripts = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

type TextPart = { text: string; font: 'display' | 'cjk' | 'unicode' };

export function DisplayText({ text, initial = false }: { text: string; initial?: boolean }) {
  if (initial) text = [...graphemes.segment(text)][0]?.segment ?? '';
  if (!/[^\x00-\x7f]/u.test(text)) return text;
  const parts: TextPart[] = [];
  // Keep accents and joined characters intact when choosing their font.
  for (const { segment } of graphemes.segment(text)) {
    const font = cjkCharacters.test(segment) ? 'cjk' : otherScripts.test(segment) ? 'unicode' : 'display';
    const previous = parts.at(-1);
    if (previous?.font === font) previous.text += segment;
    else parts.push({ text: segment, font });
  }
  return (
    <bdi className="display-text">
      {parts.map(({ text: part, font }, index) =>
        font === 'display' ? (
          part
        ) : (
          <span className={`display-text-fallback${font === 'cjk' ? ' display-text-cjk' : ''}`} key={index}>
            {part}
          </span>
        )
      )}
    </bdi>
  );
}
