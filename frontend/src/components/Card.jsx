import { useState, useCallback, useEffect } from 'react';
import {
  ImageIcon, FileText, Link2, Music, Video, File,
  Check, Copy, ExternalLink, Trash2, Maximize2, X,
  Layers, Unlink, Sparkles, Loader2,
} from 'lucide-react';
import { api } from '../lib/api';

/* ─── Type / kind metadata ─────────────────────────────────────── */
const TYPE_META = {
  audio:   { icon: Music,     color: '#aaffaa', label: 'Audio' },
  voice:   { icon: Music,     color: '#aaffaa', label: 'Voice' },
  file:    { icon: File,      color: '#ffaa99', label: 'File' },
  image:   { icon: ImageIcon, color: '#ff99aa', label: 'Image' },
  video:   { icon: Video,     color: '#cc99ff', label: 'Video' },
  link:    { icon: Link2,     color: '#999999', label: 'Link' },
  text:    { icon: FileText,  color: '#aaddff', label: 'Text' },
  unknown: { icon: File,      color: '#666666', label: 'Unknown' },
};

const KIND_META = {
  twitter:     { icon: '𝕏',  color: '#1da1f2', label: 'Twitter/X' },
  github:      { icon: '⌥',  color: '#6ee86e', label: 'GitHub' },
  youtube:     { icon: '▶',  color: '#ff4444', label: 'YouTube' },
  instagram:   { icon: '◎',  color: '#e1306c', label: 'Instagram' },
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

/* ─── Time helpers ──────────────────────────────────────────────── */
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function relTime(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ─── Drive proxy — all Drive files served through backend ─────── */
function driveProxy(fileId) {
  if (!fileId) return null;
  return `/api/desk/proxy/${fileId}`;
}

/* ─── URL / content helpers ─────────────────────────────────────── */
function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function extractYouTubeId(url) {
  if (!url) return null;
  try {
    const p = new URL(url);
    if (p.hostname.includes('youtu.be')) return p.pathname.replace('/', '') || null;
    return p.searchParams.get('v');
  } catch { return null; }
}

function extractTweetId(url) {
  const m = url?.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i);
  return m?.[1] || null;
}

function extractInstagramId(url) {
  const m = url?.match(/instagram\.com\/(?:reel|p)\/([^/?#]+)/i);
  return m?.[1] || null;
}

function extractInstagramKind(url) {
  const m = url?.match(/instagram\.com\/(reel|p)\//i);
  return m?.[1] || 'reel';
}

function looksLikePdf(item) {
  return /\.pdf|\/pdf/i.test(
    [item.file_url, item.link_url, item.title, item.raw_content].filter(Boolean).join(' ')
  );
}

function guessFileExt(item) {
  const blob = [item.file_url, item.link_url, item.title, item.raw_content]
    .filter(Boolean).join(' ').toLowerCase();
  return blob.match(/\.(pdf|md|markdown|txt|doc|docx|ppt|pptx|xls|xlsx)\b/)?.[1] || null;
}

function looksLikeMarkdown(item) {
  const ext = guessFileExt(item);
  if (ext === 'md' || ext === 'markdown') return true;
  const text = (item.raw_content || '').trim();
  return /^#{1,6}\s/m.test(text) || /\[[^\]]+\]\([^)]+\)/m.test(text) || /^[-*]\s/m.test(text);
}

/* ─── L2 Context modal ──────────────────────────────────────────── */
function Chip({ children, color = '#a78bfa' }) {
  return (
    <span
      className="inline-block text-[9px] font-mono px-1.5 py-0.5 rounded border"
      style={{ color, borderColor: color + '44', backgroundColor: color + '11' }}
    >
      {children}
    </span>
  );
}

function L2Section({ label, children }) {
  return (
    <div className="mb-3">
      <div className="text-[9px] font-mono uppercase tracking-wider mb-1.5" style={{ color: '#52525b' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function L2Modal({ item, onClose }) {
  const [loading, setLoading]   = useState(true);
  const [l2, setL2]             = useState(null);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getL2(item.id, item)
      .then((d) => { if (!cancelled) { setL2(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [item.id]);

  const depthColor = { high: '#f87171', medium: '#fbbf24', low: '#4ade80' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.80)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border flex flex-col"
        style={{ backgroundColor: '#1a1a1e', borderColor: '#27272a', maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b shrink-0" style={{ borderColor: '#27272a' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={13} style={{ color: '#a78bfa' }} />
            <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: '#a78bfa' }}>L2 Context</span>
            {l2?.provider && !loading && (
              <Chip color="#52525b">{l2.provider}</Chip>
            )}
          </div>
          <button onClick={onClose} style={{ color: '#71717a' }} className="hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 py-4 space-y-0 text-[11px]">

          {/* Item title */}
          <div className="text-[13px] font-medium mb-4 leading-snug" style={{ color: '#e4e4e7' }}>
            {item.og_title || item.title || '(untitled)'}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-2 py-6 justify-center" style={{ color: '#71717a' }}>
              <Loader2 size={14} className="animate-spin" />
              <span className="font-mono">Analysing corpus…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="font-mono py-2" style={{ color: '#f87171' }}>{error}</p>
          )}

          {/* No LLM fallback */}
          {!loading && l2?.l2_status === 'llm_unavailable' && (
            <p className="font-mono py-2" style={{ color: '#fbbf24' }}>
              All LLM providers unavailable. Add GROQ_API_KEY or OPENROUTER_API_KEY to .env for fallback.
            </p>
          )}

          {/* No content */}
          {!loading && l2?.l2_status === 'no_content' && (
            <p className="font-mono py-2" style={{ color: '#71717a' }}>No extractable text in this item.</p>
          )}

          {/* Full L2 output */}
          {!loading && l2?.semantic_summary && (
            <>
              {/* Semantic summary */}
              <L2Section label="Summary">
                <p className="leading-relaxed mb-1" style={{ color: '#d4d4d8' }}>
                  {l2.semantic_summary.one_line}
                </p>
                {l2.semantic_summary.key_insight && (
                  <div className="flex gap-2 mt-2 p-2.5 rounded-lg border border-[#27272a] bg-[#0f0f11]">
                    <span style={{ color: '#a78bfa' }} className="shrink-0">◆</span>
                    <span style={{ color: '#c4b5fd' }}>{l2.semantic_summary.key_insight}</span>
                  </div>
                )}
              </L2Section>

              {/* Content analysis */}
              {l2.content_analysis && (
                <L2Section label="Analysis">
                  <div className="flex gap-2 flex-wrap mb-2">
                    {l2.content_analysis.sentiment && (
                      <Chip color="#71717a">{l2.content_analysis.sentiment}</Chip>
                    )}
                    {l2.content_analysis.technical_depth && (
                      <Chip color={depthColor[l2.content_analysis.technical_depth] || '#71717a'}>
                        depth: {l2.content_analysis.technical_depth}
                      </Chip>
                    )}
                    {l2.raw_extractions?.word_count > 0 && (
                      <Chip color="#52525b">{l2.raw_extractions.word_count} words</Chip>
                    )}
                  </div>
                  {l2.content_analysis.actionable_items?.length > 0 && (
                    <div className="space-y-1">
                      {l2.content_analysis.actionable_items.slice(0, 4).map((a, i) => (
                        <div key={i} className="flex gap-2 items-start" style={{ color: '#a1a1aa' }}>
                          <span style={{ color: '#4ade80' }} className="shrink-0 mt-0.5">→</span>
                          {a}
                        </div>
                      ))}
                    </div>
                  )}
                </L2Section>
              )}

              {/* Entities */}
              {l2.entities?.length > 0 && (
                <L2Section label="Entities">
                  <div className="flex flex-wrap gap-1.5">
                    {l2.entities.slice(0, 10).map((e, i) => {
                      const typeColor = {
                        person: '#60a5fa', org: '#34d399', tech: '#f59e0b',
                        concept: '#a78bfa', tool: '#fb923c', place: '#38bdf8',
                      }[e.type] || '#71717a';
                      return (
                        <span key={i} className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border"
                          style={{ borderColor: typeColor + '44', color: typeColor, backgroundColor: typeColor + '11' }}>
                          {e.name}
                          <span style={{ opacity: 0.5 }}>({e.type})</span>
                        </span>
                      );
                    })}
                  </div>
                </L2Section>
              )}

              {/* Relationships */}
              {l2.relationships?.length > 0 && (
                <L2Section label="Relationships">
                  <div className="space-y-1">
                    {l2.relationships.slice(0, 4).map((r, i) => (
                      <div key={i} className="flex items-center gap-1.5 flex-wrap" style={{ color: '#a1a1aa' }}>
                        <span style={{ color: '#60a5fa' }}>{r.source}</span>
                        <span style={{ color: '#52525b' }}>→{r.relation}→</span>
                        <span style={{ color: '#34d399' }}>{r.target}</span>
                        {r.confidence && (
                          <span className="text-[9px] font-mono" style={{ color: '#52525b' }}>
                            {Math.round(r.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </L2Section>
              )}

              {/* Embedded links discovered */}
              {l2.embedded_links_discovered?.length > 0 && (
                <L2Section label="Links Discovered">
                  <div className="space-y-1">
                    {l2.embedded_links_discovered.slice(0, 6).map((lnk, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Chip color="#71717a">{lnk.link_type}</Chip>
                        <a
                          href={lnk.url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate hover:underline"
                          style={{ color: '#60a5fa', maxWidth: '280px' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {lnk.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}
                        </a>
                      </div>
                    ))}
                  </div>
                </L2Section>
              )}

              {/* Knowledge gaps */}
              {l2.content_analysis?.knowledge_gaps?.length > 0 && (
                <L2Section label="Knowledge Gaps">
                  <div className="space-y-1">
                    {l2.content_analysis.knowledge_gaps.slice(0, 3).map((g, i) => (
                      <div key={i} className="flex gap-2 items-start" style={{ color: '#71717a' }}>
                        <span style={{ color: '#fbbf24' }} className="shrink-0">?</span>{g}
                      </div>
                    ))}
                  </div>
                </L2Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Card component ────────────────────────────────────────────── */
export default function Card({ item, onMarkRead, onArchive, onAssign, onUnassign, onToggleSelect, selected, storyName }) {
  const [expanded, setExpanded]        = useState(false);
  const [showFullNote, setShowFullNote] = useState(false);
  const [copied, setCopied]            = useState(false);
  const [showL2, setShowL2]            = useState(false);

  const meta = getMeta(item);
  const isComponentIcon =
    typeof meta.icon === 'function' ||
    (meta.icon && typeof meta.icon === 'object' && '$$typeof' in meta.icon);
  const Icon = isComponentIcon ? meta.icon : null;

  /* derived flags */
  const isImage    = item.type === 'image';
  const isLink     = item.type === 'link' || !!item.link_kind;
  const isFile     = item.type === 'file';
  const isAudio    = item.type === 'audio' || item.type === 'voice';
  const isVideo    = item.type === 'video';
  const isText     = item.type === 'text' || item.type === 'unknown';
  const isPdf      = isFile && looksLikePdf(item);
  const isMarkdown = looksLikeMarkdown(item);
  const fileExt    = guessFileExt(item);

  const youtubeId     = extractYouTubeId(item.link_url);
  const tweetId       = extractTweetId(item.link_url);
  const instagramId   = extractInstagramId(item.link_url);
  const instagramKind = extractInstagramKind(item.link_url);

  const isYoutube   = Boolean(youtubeId)    || item.link_kind === 'youtube';
  const isTwitter   = Boolean(tweetId)      || item.link_kind === 'twitter';
  const isInstagram = Boolean(instagramId)  || item.link_kind === 'instagram';
  const isLinkedIn  = item.link_kind === 'linkedin';

  /* media URLs — Drive content always via proxy */
  const proxyUrl    = driveProxy(item.drive_file_id);
  // For images: primary = Drive proxy, fallback = og_image (handled via onError)
  const thumbUrl    = isImage ? (proxyUrl || item.og_image) : item.og_image;
  const thumbFallback = isImage && proxyUrl && item.og_image ? item.og_image : null;
  const audioUrl    = proxyUrl || item.file_url;
  const videoUrl    = proxyUrl || item.file_url;
  const pdfUrl      = proxyUrl;                               // native browser PDF viewer
  const docPreview  = (!isPdf && !isAudio && !isVideo && isFile && item.drive_file_id)
    ? `https://drive.google.com/file/d/${item.drive_file_id}/preview`
    : null;

  const hasRichMedia =
    isImage || isInstagram || isYoutube || isTwitter ||
    isPdf   || isAudio     || isVideo   || Boolean(docPreview);

  /* display strings */
  const displayTitle = item.og_title || item.title || '(untitled)';
  const desc         = item.og_description || item.summary || '';
  const raw          = item.raw_content || '';
  const isProcessed  = item.processed;

  /* actions */
  const handleCopy = useCallback(async () => {
    const text = item.link_url || item.file_url || item.notion_url || raw;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [item, raw]);

  const handleOpen = useCallback(() => {
    const url = item.link_url || item.file_url || item.notion_url;
    if (url) window.open(url, '_blank');
  }, [item]);

  return (
    <>
      <div
        draggable={!!onAssign}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/x-item-id', item.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={(e) => {
          // shift-click for multi-select
          if (e.shiftKey && onToggleSelect) {
            e.preventDefault();
            onToggleSelect(item.id);
          }
        }}
        className="group relative rounded-xl border transition-all duration-200 hover:shadow-lg"
        style={{
          backgroundColor: '#1a1a1e',
          borderColor: selected ? '#60a5fa' : (isProcessed ? '#1f1f23' : '#27272a'),
          padding: '16px',
          opacity: isProcessed ? 0.5 : 1,
          boxShadow: selected ? '0 0 0 1px #60a5fa inset' : undefined,
          cursor: onAssign ? 'grab' : 'default',
        }}
      >
        {/* Kind accent bar */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
          style={{ backgroundColor: meta.color }}
        />

        {/* ── Rich media previews ─────────────────────────────── */}

        {/* Image — Drive proxy primary, og_image fallback, hide container on total failure */}
        {isImage && thumbUrl && (
          <div className="relative mb-3 rounded-lg overflow-hidden bg-[#0f0f11]">
            <img
              src={thumbUrl} alt=""
              className="w-full h-36 object-cover cursor-zoom-in"
              onClick={() => setExpanded(true)}
              onError={(e) => {
                if (thumbFallback && e.target.src !== thumbFallback) {
                  e.target.src = thumbFallback;
                } else {
                  e.target.closest('div').style.display = 'none';
                }
              }}
            />
            <button
              onClick={() => setExpanded(true)}
              className="absolute bottom-2 right-2 p-1.5 rounded-md bg-black/60 text-white/80 hover:text-white"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        )}

        {/* Link OG image (external CDN URL — no proxy needed) */}
        {isLink && !isYoutube && !isInstagram && !isTwitter && item.og_image && (
          <div className="mb-3 rounded-lg overflow-hidden bg-[#0f0f11]">
            <img
              src={item.og_image} alt=""
              className="w-full h-28 object-cover"
              onError={(e) => { e.target.parentElement.style.display = 'none'; }}
            />
          </div>
        )}

        {/* YouTube */}
        {isYoutube && youtubeId && (
          <div className="mb-3 rounded-lg overflow-hidden bg-[#0f0f11] border border-[#27272a]">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              className="w-full aspect-video border-0"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="YouTube"
            />
          </div>
        )}

        {/* Twitter/X */}
        {isTwitter && tweetId && (
          <div className="mb-3 rounded-lg overflow-hidden bg-[#0f0f11] border border-[#27272a]">
            <iframe
              src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=dark`}
              className="w-full min-h-[300px] border-0"
              loading="lazy"
              title="Tweet"
            />
          </div>
        )}

        {/* Instagram */}
        {isInstagram && instagramId && (
          <div className="mb-3 rounded-lg overflow-hidden bg-[#0f0f11] border border-[#27272a]">
            <iframe
              src={`https://www.instagram.com/${instagramKind}/${instagramId}/embed`}
              className="w-full h-[420px] border-0"
              loading="lazy"
              allowFullScreen
              title="Instagram"
            />
          </div>
        )}

        {/* LinkedIn — OG card fallback (no public embed API) */}
        {isLinkedIn && (
          <div className="mb-3 rounded-lg overflow-hidden border border-[#27272a] bg-[#111216]">
            {item.og_image && (
              <img
                src={item.og_image} alt=""
                className="w-full h-36 object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div className="p-2.5 flex items-center gap-2">
              <span className="text-[11px] font-mono shrink-0" style={{ color: '#0aa880' }}>
                in LinkedIn
              </span>
              {item.og_title && (
                <span className="text-[11px] text-[#d4d4d8] truncate">{item.og_title}</span>
              )}
            </div>
          </div>
        )}

        {/* Audio — streamed from Drive via proxy (supports seeking) */}
        {isAudio && audioUrl && (
          <div className="mb-3 rounded-lg bg-[#0f0f11] border border-[#27272a] p-2.5">
            <audio
              controls
              className="w-full h-8"
              src={audioUrl}
              preload="metadata"
              style={{ accentColor: meta.color }}
            >
              Audio not supported.
            </audio>
          </div>
        )}

        {/* Video — streamed from Drive via proxy */}
        {isVideo && videoUrl && (
          <div className="mb-3 rounded-lg overflow-hidden bg-[#0f0f11] border border-[#27272a]">
            <video
              controls
              className="w-full max-h-52 object-contain bg-black"
              src={videoUrl}
              preload="metadata"
            >
              Video not supported.
            </video>
          </div>
        )}

        {/* PDF — embedded inline via proxy (native browser viewer) */}
        {isPdf && pdfUrl && (
          <div className="mb-3 rounded-lg overflow-hidden bg-[#0f0f11] border border-[#27272a]">
            <embed src={pdfUrl} type="application/pdf" className="w-full h-[360px]" />
          </div>
        )}

        {/* Office docs — Drive preview iframe (Google-rendered) */}
        {docPreview && (
          <div className="mb-3 rounded-lg overflow-hidden bg-[#0f0f11] border border-[#27272a]">
            <iframe
              src={docPreview}
              className="w-full h-[360px] border-0"
              loading="lazy"
              title="Document"
            />
          </div>
        )}

        {/* ── Card body ──────────────────────────────────────── */}

        {/* Title */}
        <div className="flex items-start gap-2.5 mb-2">
          <span className="mt-0.5 text-sm shrink-0" style={{ color: meta.color }}>
            {Icon ? <Icon size={16} /> : <span className="text-sm">{meta.icon}</span>}
          </span>
          <h3
            className="text-[13px] leading-snug font-medium break-words"
            style={{ color: isProcessed ? '#a1a1aa' : '#e4e4e7' }}
          >
            {isProcessed ? <s>{displayTitle}</s> : displayTitle}
          </h3>
        </div>

        {/* Source link — always-visible clickable chip for any item with a URL */}
        {(item.link_url || item.file_url) && (
          <a
            href={item.link_url || item.file_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-mono mb-1.5 hover:underline max-w-full truncate"
            style={{ color: '#60a5fa' }}
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={9} />
            {item.og_site || getDomain(item.link_url || item.file_url)}
          </a>
        )}

        {/* Description */}
        {desc && !isInstagram && !isTwitter && (
          <p className="text-[11px] leading-relaxed mb-2 line-clamp-3" style={{ color: '#a1a1aa' }}>
            {desc}
          </p>
        )}

        {/* L2 button — all items, no gate */}
        <button
          onClick={() => setShowL2(true)}
          className="inline-flex items-center gap-1 text-[10px] font-mono mb-2 px-2 py-0.5 rounded-md border transition-colors hover:border-[#a78bfa] hover:text-[#a78bfa]"
          style={{ borderColor: '#27272a', color: '#71717a', backgroundColor: '#0f0f11' }}
          title="Generate L2 semantic context"
        >
          <Sparkles size={9} />
          L2
        </button>

        {/* Raw text / notes / markdown */}
        {(isText || isMarkdown || (isLinkedIn && !desc)) && raw && (
          <div className="mb-2">
            <div
              className={`text-[11px] leading-relaxed whitespace-pre-wrap ${showFullNote ? '' : 'line-clamp-6'}`}
              style={{ color: '#a1a1aa' }}
            >
              {raw}
            </div>
            {raw.length > 280 && (
              <button
                onClick={() => setShowFullNote((v) => !v)}
                className="text-[10px] font-mono mt-1 hover:underline"
                style={{ color: '#60a5fa' }}
              >
                {showFullNote ? 'Show less' : 'Show full note'}
              </button>
            )}
          </div>
        )}

        {/* File badge — shown only when no rich preview rendered */}
        {(isFile || isAudio || isVideo) && !hasRichMedia && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded border"
              style={{
                color: meta.color,
                borderColor: meta.color + '33',
                backgroundColor: meta.color + '11',
              }}
            >
              {meta.label.toUpperCase()}
            </span>
            {fileExt && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#27272a] text-[#a1a1aa]">
                {fileExt.toUpperCase()}
              </span>
            )}
            {proxyUrl && (
              <a
                href={proxyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] flex items-center gap-1 hover:underline"
                style={{ color: '#60a5fa' }}
              >
                <ExternalLink size={11} /> Open file
              </a>
            )}
          </div>
        )}

        {/* Reel reference links — chips rendered between wiki text and tags */}
        {item.reel_links?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {item.reel_links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border border-[#27272a] hover:border-[#60a5fa] hover:text-[#60a5fa] transition-colors"
                style={{ color: '#a1a1aa', backgroundColor: '#0f0f11' }}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={9} />
                {link.label}
              </a>
            ))}
          </div>
        )}

        {/* Tags */}
        {(item.tags?.length > 0 || meta.label) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
              style={{
                color: meta.color,
                borderColor: meta.color + '33',
                backgroundColor: meta.color + '11',
              }}
            >
              {meta.label}
            </span>
            {item.tags?.slice(0, 4).map((t) => (
              <span
                key={t}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#27272a] bg-[#0f0f11]"
                style={{ color: '#a1a1aa' }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className="text-[10px] font-mono mt-2.5" style={{ color: '#52525b' }}>
          {formatTime(item.timestamp)} · {relTime(item.timestamp)}
        </div>

        {/* Story badge (when assigned) */}
        {storyName && (
          <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border"
            style={{ borderColor: '#60a5fa33', color: '#60a5fa', backgroundColor: '#60a5fa11' }}>
            <Layers size={10} /> {storyName}
          </div>
        )}

        {/* Hover actions */}
        <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
          {onAssign && (
            <button
              onClick={() => onAssign(item.id)}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#60a5fa] hover:text-[#60a5fa] transition-colors"
              style={{ color: '#a1a1aa' }}
              title="Assign to story"
            >
              <Layers size={12} /> Assign
            </button>
          )}
          {onUnassign && item.story_id && (
            <button
              onClick={() => onUnassign(item.id)}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#fbbf24] hover:text-[#fbbf24] transition-colors"
              style={{ color: '#a1a1aa' }}
              title="Move back to Master_Dump"
            >
              <Unlink size={12} /> Unassign
            </button>
          )}
          {!isProcessed && onMarkRead && (
            <button
              onClick={() => onMarkRead(item.id)}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#4ade80] hover:text-[#4ade80] transition-colors"
              style={{ color: '#a1a1aa' }}
            >
              <Check size={12} /> Done
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#60a5fa] hover:text-[#60a5fa] transition-colors"
            style={{ color: '#a1a1aa' }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={handleOpen}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#fbbf24] hover:text-[#fbbf24] transition-colors"
            style={{ color: '#a1a1aa' }}
          >
            <ExternalLink size={12} /> Open
          </button>
          {onArchive && (
            <button
              onClick={() => onArchive(item.id)}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#27272a] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors"
              style={{ color: '#a1a1aa' }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* L2 Context modal */}
      {showL2 && <L2Modal item={item} onClose={() => setShowL2(false)} />}

      {/* Image lightbox */}
      {expanded && thumbUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setExpanded(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setExpanded(false)}
          >
            <X size={24} />
          </button>
          <img
            src={thumbUrl} alt=""
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
