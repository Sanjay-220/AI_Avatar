from app.pipeline.cache import DiskCache, cache_key


def test_key_changes_with_every_input():
    base = cache_key("hi", "af_heart", "phoneme", "v1")
    assert base != cache_key("hi!", "af_heart", "phoneme", "v1")
    assert base != cache_key("hi", "am_adam", "phoneme", "v1")
    assert base != cache_key("hi", "af_heart", "rhubarb", "v1")
    assert base != cache_key("hi", "af_heart", "phoneme", "v2")


def test_round_trip_and_miss(tmp_path):
    cache = DiskCache(tmp_path)
    key = cache_key("hi", "af_heart", "phoneme", "v1")

    assert cache.get(key) is None
    cache.put(key, {"words": ["hi"]})
    assert cache.get(key) == {"words": ["hi"]}


def test_corrupt_entry_is_treated_as_miss(tmp_path):
    cache = DiskCache(tmp_path)
    key = cache_key("hi", "af_heart", "phoneme", "v1")
    (tmp_path / f"{key}.json").write_text("{not json")

    assert cache.get(key) is None
