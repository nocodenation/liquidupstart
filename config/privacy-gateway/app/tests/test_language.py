import pytest

ROUTED = [
    ("en", "The quick brown fox jumps over the lazy dog every morning."),
    ("de", "Ich heiße Hans Müller und wohne seit Jahren in München."),
    ("fr", "Je m'appelle Marie Dupont et j'habite à Lyon depuis longtemps."),
    ("es", "Me llamo Juan García y vivo en Madrid desde hace muchos años."),
    ("pt", "Chamo-me João Silva e moro em Lisboa há vários anos agora."),
]


@pytest.mark.parametrize("lang,text", ROUTED)
def test_router_picks_language(router, lang, text):
    code, conf = router.detect(text)
    assert code == lang
    assert conf >= 0.5


def test_router_falls_back_on_short(router):
    code, conf = router.detect("ACME-12345")
    assert code == "en"
    assert conf == 0.0
