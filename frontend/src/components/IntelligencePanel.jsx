import { useState, useEffect } from 'react';
import { Loader2, FileText, BarChart3, Network, ChevronDown, ChevronUp } from 'lucide-react';

const LEVEL_META = {
  L1: { label: 'Quick Context', icon: FileText, color: '#4ade80' },
  L2: { label: 'Structured', icon: BarChart3, color: '#60a5fa' },
  L3: { label: 'Deep Intelligence', icon: Network, color: '#c084fc' },
};

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3 border rounded-lg" style={{ borderColor: '#27272a', backgroundColor: '#0f0f11' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium"
        style={{ color: '#d4d4d8' }}
      >
        {title}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function BulletList({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-[11px] leading-relaxed flex gap-2" style={{ color: '#a1a1aa' }}>
          <span style={{ color: '#60a5fa' }}>•</span>
          <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
        </li>
      ))}
    </ul>
  );
}

function KeyValue({ data }) {
  if (!data || typeof data !== 'object') return null;
  return (
    <div className="space-y-1.5">
      {Object.entries(data).map(([k, v]) => (
        <div key={k}>
          <span className="text-[10px] font-mono uppercase tracking-wide" style={{ color: '#71717a' }}>{k.replace(/_/g, ' ')}</span>
          {typeof v === 'string' && (
            <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: '#d4d4d8' }}>{v}</p>
          )}
          {typeof v === 'object' && v !== null && (
            <div className="mt-0.5">
              {Array.isArray(v) ? <BulletList items={v} /> : <KeyValue data={v} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function L1View({ data }) {
  return (
    <div className="space-y-3">
      {data.summary && (
        <Section title="Summary">
          <p className="text-[11px] leading-relaxed" style={{ color: '#d4d4d8' }}>{data.summary}</p>
        </Section>
      )}
      {data.key_points && (
        <Section title="Key Points">
          <BulletList items={data.key_points} />
        </Section>
      )}
      {data.action_items && (
        <Section title="Action Items">
          <BulletList items={data.action_items} />
        </Section>
      )}
    </div>
  );
}

function L2View({ data }) {
  return (
    <div className="space-y-3">
      {data.summary && (
        <Section title="Summary">
          <p className="text-[11px] leading-relaxed" style={{ color: '#d4d4d8' }}>{data.summary}</p>
        </Section>
      )}
      {data.topics && (
        <Section title="Topics">
          <div className="flex flex-wrap gap-1.5">
            {data.topics.map((t, i) => (
              <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded border" style={{ borderColor: '#27272a', color: '#a1a1aa' }}>
                {typeof t === 'string' ? t : t.name}
              </span>
            ))}
          </div>
        </Section>
      )}
      {data.entities && (
        <Section title="Entities">
          <div className="space-y-1.5">
            {data.entities.map((e, i) => (
              <div key={i} className="text-[11px]" style={{ color: '#a1a1aa' }}>
                <span className="font-medium" style={{ color: '#d4d4d8' }}>{e.name || e.entity}</span>
                {e.type && <span className="ml-1 text-[10px] font-mono" style={{ color: '#71717a' }}>({e.type})</span>}
                {e.context && <p className="mt-0.5">{e.context}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
      {data.timeline && (
        <Section title="Timeline">
          <BulletList items={data.timeline.map((t) => `${t.timestamp || t.time_range || ''} — ${t.event || t.description || ''}`)} />
        </Section>
      )}
      {data.sentiment && (
        <Section title="Sentiment">
          <p className="text-[11px]" style={{ color: '#a1a1aa' }}>
            {typeof data.sentiment === 'string' ? data.sentiment : `${data.sentiment.overall || 'neutral'} (${data.sentiment.confidence || ''})`}
          </p>
        </Section>
      )}
    </div>
  );
}

function L3View({ data }) {
  return (
    <div className="space-y-3">
      {data.executive_summary && (
        <Section title="Executive Summary">
          <p className="text-[11px] leading-relaxed" style={{ color: '#d4d4d8' }}>{data.executive_summary}</p>
        </Section>
      )}
      {data.detailed_analysis && (
        <Section title="Detailed Analysis">
          <p className="text-[11px] leading-relaxed" style={{ color: '#a1a1aa' }}>{data.detailed_analysis}</p>
        </Section>
      )}
      {data.key_themes && (
        <Section title="Key Themes">
          <div className="space-y-2">
            {data.key_themes.map((t, i) => (
              <div key={i}>
                <span className="text-[11px] font-medium" style={{ color: '#d4d4d8' }}>{t.theme || t.name}</span>
                {t.description && <p className="text-[11px] mt-0.5" style={{ color: '#a1a1aa' }}>{t.description}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
      {data.recommendations && (
        <Section title="Recommendations">
          <BulletList items={data.recommendations} />
        </Section>
      )}
      {data.open_questions && (
        <Section title="Open Questions">
          <BulletList items={data.open_questions} />
        </Section>
      )}
      {data.knowledge_graph && (
        <Section title="Knowledge Graph" defaultOpen={false}>
          <KeyValue data={data.knowledge_graph} />
        </Section>
      )}
    </div>
  );
}

export default function IntelligencePanel({ pageId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('L1');

  useEffect(() => {
    let cancelled = false;
    async function fetchIntelligence() {
      try {
        setLoading(true);
        const res = await fetch(`/api/desk/items/${pageId}/intelligence`);
        if (!res.ok) throw new Error('Not available');
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchIntelligence();
    return () => { cancelled = true; };
  }, [pageId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin mr-2" style={{ color: '#60a5fa' }} />
        <span className="text-[11px] font-mono" style={{ color: '#a1a1aa' }}>Loading intelligence...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-4 text-[11px] font-mono" style={{ color: '#52525b' }}>
        Intelligence data not yet available. Processing in background...
      </div>
    );
  }

  const levelData = data[activeTab.toLowerCase()] || {};

  return (
    <div className="mt-3">
      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {['L1', 'L2', 'L3'].map((level) => {
          const meta = LEVEL_META[level];
          const Icon = meta.icon;
          const active = activeTab === level;
          return (
            <button
              key={level}
              onClick={() => setActiveTab(level)}
              className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1.5 rounded border transition-colors"
              style={{
                borderColor: active ? meta.color : '#27272a',
                color: active ? meta.color : '#a1a1aa',
                backgroundColor: active ? `${meta.color}11` : 'transparent',
              }}
            >
              <Icon size={11} />
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="max-h-[360px] overflow-y-auto pr-1">
        {activeTab === 'L1' && <L1View data={levelData} />}
        {activeTab === 'L2' && <L2View data={levelData} />}
        {activeTab === 'L3' && <L3View data={levelData} />}
      </div>

      {/* Transcript preview */}
      {data.transcript && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: '#27272a' }}>
          <p className="text-[10px] font-mono uppercase tracking-wide mb-1" style={{ color: '#52525b' }}>Transcript Preview</p>
          <p className="text-[11px] leading-relaxed line-clamp-6" style={{ color: '#a1a1aa' }}>{data.transcript}</p>
        </div>
      )}
    </div>
  );
}
