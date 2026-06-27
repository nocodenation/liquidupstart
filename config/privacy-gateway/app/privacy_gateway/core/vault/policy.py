from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from faker import Faker

FakerProvider = Callable[[Faker], str]


@dataclass(frozen=True)
class EntityPolicy:
    restorable: bool
    faker: FakerProvider
    min_len: int = 4


_DEFAULT = EntityPolicy(
    restorable=True,
    faker=lambda f: " ".join([f.word(), f.word()]).title(),
)

ENTITY_POLICY: dict[str, EntityPolicy] = {
    "PERSON": EntityPolicy(True, lambda f: f.name()),
    "LOCATION": EntityPolicy(True, lambda f: f.city()),
    "NRP": EntityPolicy(True, lambda f: f.country()),
    "ORGANIZATION": EntityPolicy(True, lambda f: f.company()),
    "EMAIL_ADDRESS": EntityPolicy(True, lambda f: f.email()),
    "URL": EntityPolicy(True, lambda f: f.domain_name()),
    "INTERNAL_HOSTNAME": EntityPolicy(
        True, lambda f: f"{f.domain_word()}-{f.domain_word()}.internal"
    ),
    "INTERNAL_ID": EntityPolicy(
        True, lambda f: f.bothify("????-#####", letters="ABCDEFGHJKLMNPQRSTUVWXYZ")
    ),
    "SECRET": EntityPolicy(
        True,
        lambda f: f.password(
            length=24, special_chars=False, digits=True, upper_case=True, lower_case=True
        ),
    ),
    "DATE_TIME": EntityPolicy(False, lambda f: f.date()),
    "AGE": EntityPolicy(False, lambda f: str(f.random_int(13, 95)), min_len=2),
    "PHONE_NUMBER": EntityPolicy(False, lambda f: f.numerify("###-###-####")),
    "CREDIT_CARD": EntityPolicy(False, lambda f: f.credit_card_number()),
    "US_SSN": EntityPolicy(False, lambda f: f.numerify("###-##-####")),
    "IP_ADDRESS": EntityPolicy(False, lambda f: f.ipv4()),
    "IBAN_CODE": EntityPolicy(False, lambda f: f.numerify("DE## #### #### #### ####")),
}


def policy_for(entity_type: str) -> EntityPolicy:
    return ENTITY_POLICY.get(entity_type, _DEFAULT)
