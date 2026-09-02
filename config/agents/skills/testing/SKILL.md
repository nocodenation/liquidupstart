---
name: testing
description: Write tests and test specifications that a newcomer can judge — what a test covers, how its data is chosen, and how to tell it can actually fail. TRIGGER when the user asks "write a test for this", "add tests", "what should this test check", "is this test any good", "document these tests", or when a specification, a test header or test data is being written or reviewed.
---

# Tests someone else can judge

The standard every test here is held to: **a reader who has never seen this project should learn,
from the test itself, what context it exists in, why it is built the way it is, why it says anything
useful about the thing under test, and how to check that a green result actually rules something
out.**

That last part is the one usually left out, so it is worth spelling out. A pass is only informative
if the reader can answer three questions:

1. **Could this test fail at all?** If nothing would turn it red, its green says nothing. The
   commonest way this goes wrong is a filter that matches no files, a guard that is never reached,
   or a suite that reports success because it ran nothing.
2. **Would it fail for the right reason?** A test can be red for a dozen reasons that have nothing
   to do with its subject. The failure message has to name what is actually wrong, or the reader
   learns only that something is.
3. **Is it exercising the real thing?** A test can pass against a stand-in that happens to agree
   with the implementation while the implementation is wrong. Anything that needs a running system
   must be shown to touch it.

A test that passes tells you nothing until those three are answered. The sections below are how they
get answered.

## The header block

Every test file opens with one. Not a description of the code — the reader can read the code — but
the things the code cannot say:

```
 * Purpose:  Why this test exists at all. What goes wrong in the world if nobody
 *           checks this.
 * Given:    The starting state, named precisely.
 * When:     What is done to it.
 * Then:     What must be true afterwards, in observable terms.
 * Covers:   The requirement or use case this serves.
 * Unhappy:  The counterpart scenario, or a note saying where it lives.
```

Write `Purpose` for someone who does not yet know the feature. "Checks the parser" is worthless;
"a section that reads well to a human but does not parse is a silent failure — the keys never appear
in the UI" tells them why anyone bothered.

## State the test data, do not describe it

**A test is only as good as what it runs against**, so the data is where its worth is decided. Give
the values.

| Describing it | Stating it |
|---|---|
| "a commit with an innocuous file" | `notes.md` containing the line `probe`, committed as `add probe note` |
| "an invalid container name" | `liquidupstart-no-such-container`, chosen so no environment can supply it by accident |
| "a fixture private key" | a file `deploy_key` holding `-----BEGIN OPENSSH PRIVATE KEY-----`, `AAAAFIXTURENOTAREALKEY`, `-----END OPENSSH PRIVATE KEY-----` — shaped to match what a scan looks for while being no key at all |

Name **both sides**: what must exist, and where it comes from, as well as what must not. A guard
checked only against something invented has not been shown to accept anything real.

Where a value is deliberately shaped, say why. A synthetic secret should be obviously synthetic, so
that a reader who meets it in a failure message does not go hunting for a leak.

## Name the fixture and say where it lives

"The shared fixture" is not something a reader can look up. Give it a name and a location — a real
exported thing in a real file — and have each test refer to it by that name. Then state only what
each test *changes* about it, so a difference in outcome is attributable to the one setting named.

## Every scenario gets its own entry, labelled

A case usually holds several: the guard refusing, and the counterpart proving it also permits. Both
belong in the specification. **A rule that only refuses is as useless as one that only permits**, and
a reader cannot tell from one line which was tested. Where a counterpart is deliberately omitted, say
so and why, so the gap reads as a decision.

## Answer the three questions

**Could it fail?** Include the negative scenario, so refusing and permitting are both demonstrated.
Where a whole suite is involved, provide a way to watch it go red on purpose — a throwaway tree
holding a deliberately failing case, run and then deleted, so nothing red is left behind.

**Would it fail for the right reason?** Assert on the message, not only on the exit status. "Non-zero
exit" is satisfied by a typo in the script. `the message contains "main", "protected" and "feature
branch"` is satisfied only by the rule having fired and having said something useful.

**Is it exercising the real thing?** For anything that needs a running system, stop the dependency
and check the test goes red — **a test that passes with its subject switched off is measuring
nothing.** Give each milestone a documented procedure for this, so the check is repeatable by someone
who was not there when it was written.

## Assert the property, not the circumstance

The most common way a green test is wrong. "No key is registered" is a circumstance; "an unregistered
key is refused" is the property. "The configuration file is empty" is a circumstance; "a default
exists so the file need not be filled" is the property.

A test that asserts what has **not** been done depends on nobody doing it — and breaks the moment
someone uses the feature as intended, for reasons that have nothing to do with the code.

## Record what a test found

Once a test has run, add what it caught. In a table, a test that never found anything and one that
caught a defect before it shipped look identical. The difference is the only evidence anyone has
about whether the testing was worth doing.
