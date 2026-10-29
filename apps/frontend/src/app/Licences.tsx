import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import notices from '../../../../THIRD_PARTY_NOTICES.md?raw';
import Icon from './Icon';

/**
 * Where the app serves a file THIRD_PARTY_NOTICES.md links to: the interface's own licences from public/licences, the
 * rest at their repository paths beside them, with .txt added to a name without it (scripts/desktop.mjs
 * copies them). Web addresses stay as they are.
 */
export function licenceUrl(url: string) {
  if (/^[a-z][a-z0-9+.-]*:|^#/i.test(url)) return url;
  if (url.startsWith('apps/frontend/public/licences/')) return `/licences/${url.slice('apps/frontend/public/licences/'.length)}`;
  return `/licences/${url}${/\.txt$/i.test(url) ? '' : '.txt'}`;
}

/** Settings › System › Licences: the third-party notices, each licence a link that opens in the browser. */
export default function Licences({ onBack }: { onBack: () => void }) {
  return (
    <>
      <div>
        <button className="btn small" onClick={onBack}>
          <Icon name="chevron.left" /> System
        </button>
      </div>
      <div className="md licences">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={licenceUrl}
          components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
        >
          {notices}
        </ReactMarkdown>
      </div>
    </>
  );
}
