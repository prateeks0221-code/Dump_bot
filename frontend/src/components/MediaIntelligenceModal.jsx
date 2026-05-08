import { useState, useCallback, useRef } from 'react';
import { X, Upload, Link2, Loader2, BrainCircuit } from 'lucide-react';

export default function MediaIntelligenceModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('upload'); // 'upload' | 'url'
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFile = useCallback((f) => {
    if (!f) return;
    const valid = ['audio/mpeg','audio/wav','audio/x-wav','video/mp4','video/quicktime','video/x-matroska'];
    if (!valid.includes(f.type) && !/\.(mp3|wav|mp4|mov|mkv)$/i.test(f.name)) {
      setError('Unsupported file type. Use mp3, wav, mp4, mov, or mkv.');
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'upload' && file) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/media/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        onSuccess?.(data);
      } else if (mode === 'url' && url.trim()) {
        const res = await fetch('/api/media/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ingest failed');
        onSuccess?.(data);
      } else {
        throw new Error('Please provide a file or URL');
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode, file, url, onClose, onSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border p-5" style={{ backgroundColor: '#1a1a1e', borderColor: '#27272a' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BrainCircuit size={18} style={{ color: '#60a5fa' }} />
            <h2 className="text-sm font-semibold" style={{ color: '#e4e4e7' }}>Media Intelligence</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#27272a]" style={{ color: '#a1a1aa' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setMode('upload'); setError(null); }}
            className="flex-1 text-xs py-2 rounded border transition-colors"
            style={{
              borderColor: mode === 'upload' ? '#60a5fa' : '#27272a',
              color: mode === 'upload' ? '#60a5fa' : '#a1a1aa',
              backgroundColor: mode === 'upload' ? 'rgba(96,165,250,0.08)' : 'transparent',
            }}
          >
            <Upload size={12} className="inline mr-1" /> Upload
          </button>
          <button
            onClick={() => { setMode('url'); setError(null); }}
            className="flex-1 text-xs py-2 rounded border transition-colors"
            style={{
              borderColor: mode === 'url' ? '#60a5fa' : '#27272a',
              color: mode === 'url' ? '#60a5fa' : '#a1a1aa',
              backgroundColor: mode === 'url' ? 'rgba(96,165,250,0.08)' : 'transparent',
            }}
          >
            <Link2 size={12} className="inline mr-1" /> URL
          </button>
        </div>

        {mode === 'upload' && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors mb-4"
            style={{
              borderColor: dragOver ? '#60a5fa' : '#27272a',
              backgroundColor: dragOver ? 'rgba(96,165,250,0.05)' : '#0f0f11',
            }}
          >
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => handleFile(e.target.files[0])} accept=".mp3,.wav,.mp4,.mov,.mkv" />
            <Upload size={20} className="mx-auto mb-2" style={{ color: '#52525b' }} />
            <p className="text-xs" style={{ color: '#a1a1aa' }}>
              {file ? file.name : 'Drop file or click to browse'}
            </p>
            <p className="text-[10px] mt-1 font-mono" style={{ color: '#52525b' }}>mp3, wav, mp4, mov, mkv</p>
          </div>
        )}

        {mode === 'url' && (
          <div className="mb-4">
            <input
              type="text"
              placeholder="Paste YouTube, Instagram, or direct media URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded border outline-none"
              style={{
                backgroundColor: '#0f0f11',
                borderColor: '#27272a',
                color: '#e4e4e7',
              }}
            />
          </div>
        )}

        {error && (
          <div className="text-[11px] mb-3 font-mono" style={{ color: '#ef4444' }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full text-xs font-medium py-2 rounded transition-colors flex items-center justify-center gap-2"
          style={{
            backgroundColor: loading ? '#27272a' : '#60a5fa',
            color: loading ? '#a1a1aa' : '#0f0f11',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading && <Loader2 size={12} className="animate-spin" />}
          {loading ? 'Processing...' : 'Start Intelligence'}
        </button>

        <p className="text-[10px] text-center mt-3 font-mono" style={{ color: '#52525b' }}>
          Transcription + L1/L2/L3 analysis runs in the background.
        </p>
      </div>
    </div>
  );
}
