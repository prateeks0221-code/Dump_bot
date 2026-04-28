import { useState, useCallback } from 'react';
import {
  ImageIcon, FileText, Link2, Music, Video, File,
  Check, Copy, ExternalLink, Trash2, Maximize2, X
} from 'lucide-react';

const TYPE_META = {
  audio:    { icon: Music,      color: '#aaffaa', label: 'Audio' },
  file:     { icon: File,       color: '#ffaa99', label: 'File' },
  image:    { icon: ImageIcon,  color: '#ff99aa', label: 'Image' },
  video:    { icon: Video,      color: '#cc99ff', label: 'Video' },
  link:     { icon: Link2,      color: '#999999', label: 'Link' },
  text:     { icon: FileText,   color: '#aaddff', label: 'Text' },
  unknown:  { icon: File,       color: '#666666', label: 'Unknown' },
};

const KIND_META = {
  twitter:     { icon: '𝕏',  color: '#1da1f2', label: 'Twitter' },
  github:      { icon: '⌥',  color: '#6ee86e', label: 'GitHub' },
  youtube:     { icon: '▶',  color: '#ff4444', label: 'YouTube' },
  reddit:      { icon: '◉',  color: '#ff7744', label: 'Reddit' },
  linkedin:    { icon: '∈',  color: '#0aa880', label: 'LinkedIn' },
  article:     { icon: '✦',  color: '#aaaaff', label: 'Article' },
  producthunt: { icon: '▲',  color: '#da552f', label: 'PH' },
  notion:      { icon: '◻',  color: '#dddddd', label: 'Notion' },
  figma:       { icon: '◈',  color: '#a259ff', label: 'Figma' },
  gdoc:        { icon: '◧',  color: '#4285f4', label: 'GDoc' },
  markdown:    { icon: '⌗',  color: '#88bbff', label: 'MD' },
};

function getMeta(item) {
  if (item.link_kind && KIND_META[item.link_kind]) return KIND_META[item.link_kind];
  return TYPE_META[item.type] || TYPE_META.unknown;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function relTime(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function driveThumbnail(fileId) {
  if (!fileId) return null;
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400-h400`;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export default function Card({ item, onMarkRead, onArchive }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const meta = getMeta(item);
  const isComponentIcon = typeof meta.icon === 'function'
    || (meta.icon && typeof meta.icon === 'object' && '$$typeof' in meta.icon);
  const Icon = isComponentIcon ? meta.icon : null;

  const url = item.link_url || item.file_url || item.notion_url;
  const displayTitle = item.og_title || item.title || '(untitled)';
  const desc = item.og_description || item.summary || '';
  const raw = item.raw_content || '';
  const isProcessed = item.processed;

  const handleCopy = useCallback(async () => {
    const text = item.link_url || item.file_url || item.notion_url || raw;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [item]);

  const handleOpen = useCallback(() => {
    const openUrl = item.notion_url || item.file_url || item.link_url;
    if (openUrl) window.open(openUrl, '_blank');
  }, [item]);

  const isImage = item.type === 'image';
  const isLink = item.type === 'link' || item.link_kind;
  const isFile = item.type === 'file';
  const isAudio = item.type === 'audio';
  const isVideo = item.type === 'video';
  const isText = item.type === 'text' || item.type === 'unknown';
  const thumbUrl = isImage ? driveThumbnail(item.drive_file_id) : item.og_image;

  return (
    <>
      <div className="group relative rounded-xl border transition-all duration-200 hover:shadow-lg"
        style={{
          backgroundColor: '#1a1a1e',
          borderColor: isProcessed ? '#1f1f23' : '#27272a',
          padding: '16px',
          opacity: isProcessed ? 0.5 : 1,
        }}
      >
        {/* Kind bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl" style={{ backgroundColor: meta.color }} />

        {/* Thumbnail */}
        {thumbUrl && (
          <div className="relative mb-3 rounded-lg overflow-hidden bg-[#0f0f11]">
            <img src={thumbUrl} alt="" className="w-full h-36 object-cover cursor-zoom-in"
              onClick={() => setExpanded(true)}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            {isImage && (
              <button onClick={() => setExpanded(true)}
                className="absolute bottom-2 right-2 p-1.5 rounded-md bg-black/60 text-white/80 hover:text-white"
              >
                <Maximize2 size={14} />
              </button>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start gap-2.5 mb-2">
          <span className="mt-0.5 text-sm shrink-0" style={{ color: meta.color }}>
            {Icon ? <Icon size={16} /> : <span className="text-sm">{meta.icon}</span>}
          </span>
          <h3 className="text-[13px] leading-snug font-medium break-words" style={{ color: isProcessed ? '#a1a1aa' : '#e4e4e7' }}>
            {isProcessed ? <span className="line-through">{displayTitle}</span> : displayTitle}
          </h3>
        </div>

        {/* Site / domain */}
        {isLink && item.og_site && (
          <div className="text-[11px] font-mono mb-1.5" style={{ color: '#a1a1aa' }}>{item.og_site}</div>
        )}
        {isLink && !item.og_site && item.link_url && (
          <div className="text-[11px] font-mono mb-1.5" style={{ color: '#a1a1aa' }}>{getDomain(item.link_url)}</div>
        )}

        {/* Description */}
        {desc && (
          <p className="text-[11px] leading-relaxed mb-2 line-clamp-3" style={{ color: '#a1a1aa' }}>{desc}</p>
        )}

        {/* Text / Raw content preview */}
        {isText && raw && (
          <p className="text-[11px] leading-relaxed mb-2 line-clamp-5 whitespace-pre-wrap" style={{ color: '#a1a1aa' }}>
            {raw.slice(0, 500)}{raw.length > 500 ? '…' : ''}
          </p>
        )}

        {/* File badge */}
        {(isFile || isAudio || isVideo) && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
              style={{ color: meta.color, borderColor: meta.color + '33', backgroundColor: meta.color + '11' }}
            >{meta.label.toUpperCase()}</span>
            {item.drive_file_id && (
              <button onClick={handleOpen} className="text-[11px] flex items-center gap-1 hover:underline" style={{ color: '#60a5fa' }}>
                <ExternalLink size={11} /> Open in Drive
              </button>
            )}
          </div>
        )}

        {/* Tags */}
        {(item.tags?.length > 0 || meta.label) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
              style={{ color: meta.color, borderColor: meta.color + '33', backgroundColor: meta.color + '11' }}
            >{meta.label}</span>
            {item.tags?.slice(0, 4).map((t) => (
              <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#27272a] bg-[#0f0f11]"
                style={{ color: '#a1a1aa' }}>{t}</span>
            ))}
          </div>
        )}

        {/* Time */}
        <div className="text-[10px] font-mono mt-2.5" style={{ color: '#52525b' }}>
          {formatTime(item.timestamp)} · {relTime(item.timestamp)}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isProcessed && (
            <button onClick={() => onMarkRead(item.id)}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#4ade80] hover:text-[#4ade80] transition-colors"
              style={{ color: '#a1a1aa' }} title="Mark read"
            >
              <Check size={12} /> Read
            </button>
          )}
          <button onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#60a5fa] hover:text-[#60a5fa] transition-colors"
            style={{ color: '#a1a1aa' }} title="Copy link"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={handleOpen}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#fbbf24] hover:text-[#fbbf24] transition-colors"
            style={{ color: '#a1a1aa' }} title="Open original"
          >
            <ExternalLink size={12} /> Open
          </button>
          <button onClick={() => onArchive(item.id)}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors"
            style={{ color: '#a1a1aa' }} title="Archive"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {expanded && thumbUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setExpanded(false)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setExpanded(false)}>
            <X size={24} />
          </button>
          <img src={thumbUrl} alt="" className="max-w-full max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
