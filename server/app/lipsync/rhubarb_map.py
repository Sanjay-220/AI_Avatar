"""Translate Rhubarb's mouth shapes (A-H, X) into TalkingHead's Oculus visemes."""

import json

from app.models import MouthCue, Visemes

# Rhubarb shape reference: https://github.com/DanielSWolf/rhubarb-lip-sync#mouth-shapes
RHUBARB_TO_OCULUS: dict[str, str] = {
    "A": "PP",  # closed lips: P, B, M
    "B": "SS",  # slightly open, clenched teeth: most consonants, EE
    "C": "E",   # open: EH, AE
    "D": "aa",  # wide open: AA
    "E": "O",   # slightly rounded: AO, ER
    "F": "U",   # puckered: UW, OW, W
    "G": "FF",  # upper teeth on lower lip: F, V
    "H": "nn",  # tongue raised: long L
    "X": "sil",  # rest / silence
}


def parse_rhubarb_json(raw: str) -> tuple[MouthCue, ...]:
    """Parse `rhubarb -f json` output into mouth cues."""
    try:
        cues = json.loads(raw)["mouthCues"]
        return tuple(MouthCue(float(c["start"]), float(c["end"]), str(c["value"])) for c in cues)
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise ValueError(f"Unexpected Rhubarb output: {exc}") from exc


def cues_to_visemes(cues: tuple[MouthCue, ...]) -> Visemes:
    """Map cues to Oculus visemes in ms, dropping rest shapes (TalkingHead rests on its own)."""
    spoken = [c for c in cues if RHUBARB_TO_OCULUS.get(c.shape, "sil") != "sil"]
    return Visemes(
        visemes=tuple(RHUBARB_TO_OCULUS[c.shape] for c in spoken),
        vtimes=tuple(round(c.start * 1000) for c in spoken),
        vdurations=tuple(round((c.end - c.start) * 1000) for c in spoken),
    )
