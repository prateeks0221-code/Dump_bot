from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import List


class AnalysisLevel(str, Enum):
    L1 = "L1"  # Ultra concise intelligence
    L2 = "L2"  # Structured contextual understanding
    L3 = "L3"  # Deep analytical intelligence


@dataclass(frozen=True)
class LevelSpec:
    level: AnalysisLevel
    name: str
    description: str
    output_sections: List[str]
    max_tokens: int
    temperature: float


LEVEL_SPECS = {
    AnalysisLevel.L1: LevelSpec(
        level=AnalysisLevel.L1,
        name="Quick Intelligence",
        description="Ultra concise summary. Key takeaways only.",
        output_sections=["summary", "key_points", "action_items"],
        max_tokens=1024,
        temperature=0.3,
    ),
    AnalysisLevel.L2: LevelSpec(
        level=AnalysisLevel.L2,
        name="Structured Analysis",
        description="Structured contextual understanding with topics, entities, and timeline.",
        output_sections=[
            "summary",
            "key_points",
            "topics",
            "entities",
            "timeline",
            "action_items",
            "sentiment",
        ],
        max_tokens=4096,
        temperature=0.5,
    ),
    AnalysisLevel.L3: LevelSpec(
        level=AnalysisLevel.L3,
        name="Deep Intelligence",
        description="Deep analytical intelligence with reasoning, patterns, and insights.",
        output_sections=[
            "executive_summary",
            "detailed_analysis",
            "key_themes",
            "entities_and_relationships",
            "timeline_and_events",
            "speaker_insights",
            "sentiment_analysis",
            "action_items",
            "open_questions",
            "recommendations",
            "knowledge_graph",
        ],
        max_tokens=8192,
        temperature=0.7,
    ),
}


def get_level_spec(level: AnalysisLevel) -> LevelSpec:
    return LEVEL_SPECS[level]
