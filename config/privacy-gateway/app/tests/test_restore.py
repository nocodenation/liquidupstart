from privacy_gateway.core.restore import restore_json, restore_text


def test_boundary_alice_not_in_malice():
    rev = {"Alice": "Bob"}
    assert restore_text("Malice met Alice in Wonderland", rev) == "Malice met Bob in Wonderland"


def test_boundary_no_restore_inside_longer_word():
    rev = {"Berlin": "Munich"}
    assert restore_text("Berliner", rev) == "Berliner"
    assert restore_text("Berlin", rev) == "Munich"


def test_longest_first_shadowing():
    rev = {"Lake": "Pond", "Lake Joshuabury": "Berlin"}
    assert restore_text("I saw Lake Joshuabury today", rev) == "I saw Berlin today"


def test_single_pass_no_recascade():
    rev = {"Foo": "FooFoo"}
    assert restore_text("Foo", rev) == "FooFoo"


def test_multiple_occurrences():
    rev = {"Alice": "Bob"}
    assert restore_text("Alice and Alice", rev) == "Bob and Bob"


def test_punctuation_boundaries():
    rev = {"André Vicente": "Hans Müller"}
    assert restore_text("Call André Vicente, please.", rev) == "Call Hans Müller, please."
    assert restore_text("André Vicente's report", rev) == "Hans Müller's report"


def test_empty_reverse_map_is_identity():
    assert restore_text("nothing to do here", {}) == "nothing to do here"


def test_json_restores_values_not_keys_numbers_structure():
    rev = {"Alice": "Bob"}
    obj = {
        "name": "Alice",
        "Alice": 1,
        "age": 42,
        "tags": ["Alice", "x"],
        "nested": {"city": "Alice", "ok": True, "none": None},
    }
    out = restore_json(obj, rev)
    assert out == {
        "name": "Bob",
        "Alice": 1,
        "age": 42,
        "tags": ["Bob", "x"],
        "nested": {"city": "Bob", "ok": True, "none": None},
    }


def test_non_restorable_date_trap():
    rev = {"Munich": "Berlin"}
    obj = {
        "date_digits": 20150805,
        "note": "deadline set on 2015-08-05 in Munich",
    }
    out = restore_json(obj, rev)
    assert out["date_digits"] == 20150805
    assert out["note"] == "deadline set on 2015-08-05 in Berlin"


def test_numeric_string_surrogate_not_restored_when_absent_from_rev():
    rev = {"Munich": "Berlin"}
    obj = {"phone_surrogate": "104-332-1819", "city": "Munich"}
    out = restore_json(obj, rev)
    assert out["phone_surrogate"] == "104-332-1819"
    assert out["city"] == "Berlin"
