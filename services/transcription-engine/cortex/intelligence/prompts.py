from __future__ import annotations

from cortex.intelligence.levels import AnalysisLevel

SYSTEM_PROMPT = """You are Cortex, an AI intelligence engine that analyzes transcripts.
You produce structured, actionable intelligence from spoken content.
Always respond in valid JSON matching the requested output schema.
Be precise, factual, and grounded in the transcript content."""

L1_PROMPT = """Analyze this transcript and produce ultra-concise intelligence.

TRANSCRIPT:
---
{transcript}
---

METADATA:
- Duration: {duration}
- Language: {language}
- Segments: {num_segments}

Respond with JSON:
{{
  "summary": "2-3 sentence summary",
  "key_points": ["point 1", "point 2", ...],
  "action_items": ["action 1", ...] or []
}}"""

L2_PROMPT = """Analyze this transcript and produce structured contextual understanding.

TRANSCRIPT:
---
{transcript}
---

METADATA:
- Duration: {duration}
- Language: {language}
- Segments: {num_segments}

Respond with JSON:
{{
  "summary": "3-5 sentence comprehensive summary",
  "key_points": ["point 1", ...],
  "topics": [
    {{"name": "topic", "relevance": 0.0-1.0, "mentions": 0}}
  ],
  "entities": [
    {{"name": "entity", "type": "person|org|place|product|concept", "context": "brief context"}}
  ],
  "timeline": [
    {{"timestamp": "MM:SS", "event": "description"}}
  ],
  "action_items": ["action 1", ...],
  "sentiment": {{
    "overall": "positive|negative|neutral|mixed",
    "confidence": 0.0-1.0
  }}
}}"""

L3_PROMPT = """Perform deep analytical intelligence on this transcript.
Think step-by-step. Identify patterns, infer meaning, and build structured intelligence.

TRANSCRIPT:
---
{transcript}
---

METADATA:
- Duration: {duration}
- Language: {language}
- Segments: {num_segments}

Respond with JSON:
{{
  "executive_summary": "Comprehensive executive summary (5-8 sentences)",
  "detailed_analysis": "Multi-paragraph deep analysis of content, context, and implications",
  "key_themes": [
    {{"theme": "name", "description": "explanation", "evidence": ["quote/reference"]}}
  ],
  "entities_and_relationships": [
    {{"entity": "name", "type": "person|org|concept", "relationships": ["related to X because Y"]}}
  ],
  "timeline_and_events": [
    {{"time_range": "MM:SS - MM:SS", "event": "description", "significance": "why it matters"}}
  ],
  "speaker_insights": [
    {{"speaker": "identifier", "tone": "description", "key_positions": ["position 1"]}}
  ],
  "sentiment_analysis": {{
    "overall": "positive|negative|neutral|mixed",
    "progression": "how sentiment changes over time",
    "notable_shifts": ["shift description"]
  }},
  "action_items": [
    {{"item": "description", "priority": "high|medium|low", "owner": "if identifiable"}}
  ],
  "open_questions": ["unresolved question from the content"],
  "recommendations": ["actionable recommendation based on analysis"],
  "knowledge_graph": {{
    "nodes": [{{"id": "entity", "type": "category"}}],
    "edges": [{{"from": "entity1", "to": "entity2", "relationship": "description"}}]
  }}
}}"""


LEVEL_PROMPTS = {
    AnalysisLevel.L1: L1_PROMPT,
    AnalysisLevel.L2: L2_PROMPT,
    AnalysisLevel.L3: L3_PROMPT,
}


def build_prompt(
    level: AnalysisLevel,
    transcript_text: str,
    duration: str,
    language: str,
    num_segments: int,
) -> str:
    template = LEVEL_PROMPTS[level]
    return template.format(
        transcript=transcript_text,
        duration=duration,
        language=language,
        num_segments=num_segments,
    )
