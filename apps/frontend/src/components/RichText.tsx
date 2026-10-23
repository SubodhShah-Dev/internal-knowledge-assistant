import { Fragment } from 'react';

/** Renders **bold**, `code`, and [S1]-style citations without raw markdown. */
export default function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[S\d+\])/g);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return <Fragment key={index} />;
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code key={index} className="rich-code">
              {part.slice(1, -1)}
            </code>
          );
        }
        const citation = /^\[(S\d+)\]$/.exec(part);
        if (citation) {
          return (
            <span key={index} className="cite" title={`Evidence ${citation[1]}`}>
              {citation[1]}
            </span>
          );
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}
