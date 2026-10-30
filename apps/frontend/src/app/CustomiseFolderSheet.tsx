import { useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { FOLDER_COLOURS, FOLDER_SYMBOLS, colourFolder, isFolderEmoji, markFolder } from './folders';
import type { ProjectFolder, ProjectFolders } from './folders';
import { FOLDER_TINTS, FolderShape } from './Home';
import Icon from './Icon';
import { IS_WINDOWS } from './platform';
import Sheet from './Sheet';

// Customise Folder…, as Finder has it: the folder with its name, its colour, then a symbol or an emoji for its front.
// Every choice shows on the folder at once.

/** a few to start from; the system's emoji viewer has the rest */
const EMOJI = ['📚', '📖', '✏️', '📝', '🎓', '🏫', '🔬', '🧪', '🧬', '🔭', '🧮', '📐', '📊', '💼', '💡', '📌', '🎵', '🎨', '🎭', '🎬', '📷', '💻', '🗂️', '📦', '⭐', '❤️', '🔥', '✨', '🌱', '🌏', '☀️', '🌙', '🐶', '🐱', '🍎', '☕', '🏠', '✈️', '🚗', '⚽', '🏏', '🎮', '🎁', '🎉', '✅', '❓'];

const VIEWER = IS_WINDOWS ? 'Win + .' : 'fn E or Control-Command-Space';

/** 'person.2' → 'person 2', for screen readers */
const spoken = (symbol: string) => symbol.replace(/\./g, ' ');

/**
 * onKeyDown for a set of buttons only one of which is in the tab order: the arrows move along them, up and down to the
 * nearest one on the next line, Home and End to the ends.
 */
function arrows(e: ReactKeyboardEvent<HTMLElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-choice]')];
  const at = items.indexOf(e.target as HTMLElement);
  if (at < 0) return;
  const r = items[at].getBoundingClientRect();
  const line = (down: boolean) => {
    const next = items.filter((el) => (down ? el.getBoundingClientRect().top > r.bottom - 2 : el.getBoundingClientRect().bottom < r.top + 2));
    const top = down ? Math.min(...next.map((el) => el.getBoundingClientRect().top)) : Math.max(...next.map((el) => el.getBoundingClientRect().top));
    const row = next.filter((el) => el.getBoundingClientRect().top === top);
    return row.sort((a, b) => Math.abs(a.getBoundingClientRect().left - r.left) - Math.abs(b.getBoundingClientRect().left - r.left))[0];
  };
  const move = ({
    ArrowRight: () => items[at + 1],
    ArrowLeft: () => items[at - 1],
    ArrowDown: () => line(true),
    ArrowUp: () => line(false),
    Home: () => items[0],
    End: () => items[items.length - 1]
  } as Record<string, () => HTMLElement | undefined>)[e.key];
  if (!move) return;
  e.preventDefault();
  const to = move();
  to?.focus();
  // in a radio group the choice follows the focus
  if (e.currentTarget.getAttribute('role') === 'radiogroup') to?.click();
}

export default function CustomiseFolderSheet({
  folder,
  onChange,
  onClose
}: {
  folder: ProjectFolder;
  onChange: (change: (tree: ProjectFolders, id: string) => ProjectFolders) => void;
  onClose: () => void;
}) {
  const [emojiOpen, setEmojiOpen] = useState(!!folder.emoji);
  const [typed, setTyped] = useState('');
  /** the one symbol in the tab order: the chosen one, or the first */
  const tabSymbol = folder.symbol ?? FOLDER_SYMBOLS[0][1][0];
  const colours = [null, ...FOLDER_COLOURS];
  const typedBad = typed.trim() !== '' && !isFolderEmoji(typed.trim());

  const setEmoji = (emoji: string) => onChange((tree, id) => markFolder(tree, id, { emoji }));

  return (
    <Sheet title="Customise Folder" width={460} className="customise-folder" onClose={onClose} actions={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="customise-preview">
        <FolderShape {...folder} />
        <div className="customise-name">{folder.name}</div>
      </div>

      <div className="customise-colours" role="radiogroup" aria-label="Colour" onKeyDown={arrows}>
        {colours.map((c) => {
          const checked = (folder.colour ?? null) === c;
          return (
            <button
              key={c ?? 'none'}
              data-choice
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              autoFocus={checked && !emojiOpen}
              title={c ? FOLDER_TINTS[c] : 'No colour'}
              aria-label={c ? FOLDER_TINTS[c] : 'No colour'}
              className={`colour-choice ${c ? `folder-colour ${c}` : 'none'}`}
              onClick={() => onChange((tree, id) => colourFolder(tree, id, c))}            >
              {!c && <Icon name="tag" />}
            </button>
          );
        })}
      </div>

      {emojiOpen ? (
        <div className="customise-emoji">
          <input
            className="input"
            autoFocus
            value={typed}
            placeholder="Type or paste an emoji"
            aria-label="Emoji"
            aria-invalid={typedBad}
            aria-describedby="emoji-hint"
            onChange={(e) => {
              setTyped(e.target.value);
              if (isFolderEmoji(e.target.value.trim())) setEmoji(e.target.value.trim());
            }}
          />
          <div id="emoji-hint" className={`field-hint ${typedBad ? 'error' : ''}`}>
            {typedBad ? 'That isn’t one emoji.' : `Press ${VIEWER} for the emoji viewer.`}
          </div>
          <div className="customise-grid emoji" role="group" aria-label="Emoji" onKeyDown={arrows}>
            {EMOJI.map((emoji, i) => (
              <button
                key={emoji}
                data-choice
                className="symbol-choice"
                aria-pressed={folder.emoji === emoji}
                tabIndex={(folder.emoji ? folder.emoji === emoji : i === 0) ? 0 : -1}
                onClick={() => setEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="customise-symbols" role="group" aria-label="Symbols" onKeyDown={arrows}>
          {FOLDER_SYMBOLS.map(([category, names]) => (
            <section key={category}>
              <h3 className="customise-heading">{category}</h3>
              <div className="customise-grid">
                {names.map((name) => (
                  <button
                    key={name}
                    data-choice
                    className="symbol-choice"
                    aria-label={spoken(name)}
                    title={spoken(name)}
                    aria-pressed={folder.symbol === name}
                    tabIndex={name === tabSymbol ? 0 : -1}
                    onClick={() => onChange((tree, id) => markFolder(tree, id, { symbol: name }))}
                  >
                    <Icon name={name} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="customise-actions">
        <button className="btn" disabled={!folder.symbol && !folder.emoji} onClick={() => onChange((tree, id) => markFolder(tree, id, {}))}>
          Clear
        </button>
        <button className="btn" onClick={() => setEmojiOpen(!emojiOpen)}>
          {emojiOpen ? 'Symbols' : 'Emoji'}
        </button>
      </div>
    </Sheet>
  );
}
