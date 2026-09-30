import json
from pathlib import Path

from app.lipsync.rhubarb_map import RHUBARB_TO_OCULUS, cues_to_visemes, parse_rhubarb_json
from app.models import MouthCue

FIXTURE = Path(__file__).parent.parent / "fixtures" / "rhubarb-sample.json"
OCULUS = {"aa", "E", "I", "O", "U", "PP", "SS", "TH", "CH", "FF", "kk", "nn", "RR", "DD", "sil"}


def test_every_rhubarb_shape_maps_to_a_talkinghead_viseme():
    assert set(RHUBARB_TO_OCULUS) == set("ABCDEFGHX")
    assert set(RHUBARB_TO_OCULUS.values()) <= OCULUS


def test_closed_lips_and_teeth_on_lip_map_to_pp_and_ff():
    assert RHUBARB_TO_OCULUS["A"] == "PP"
    assert RHUBARB_TO_OCULUS["G"] == "FF"


def test_cues_convert_seconds_to_milliseconds_and_drop_silence():
    cues = (
        MouthCue(start=0.0, end=0.1, shape="X"),
        MouthCue(start=0.1, end=0.25, shape="D"),
        MouthCue(start=0.25, end=0.3, shape="A"),
    )

    visemes = cues_to_visemes(cues)

    assert visemes.visemes == ("aa", "PP")
    assert visemes.vtimes == (100, 250)
    assert visemes.vdurations == (150, 50)


def test_parse_real_rhubarb_output():
    cues = parse_rhubarb_json(FIXTURE.read_text())

    assert len(cues) > 10
    assert cues[0].start == 0.0
    assert all(c.end >= c.start for c in cues)


def test_parse_rejects_malformed_json():
    import pytest

    with pytest.raises(ValueError):
        parse_rhubarb_json(json.dumps({"no": "cues"}))
