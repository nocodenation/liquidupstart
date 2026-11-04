/**
 * M-B7 · Contract · The builder shares no dependency cache, and the seed is declared where it is read
 *
 * Purpose:  B1's fourth leg, 2026-10-01 review: `volumes/nar_builder/m2` was
 *           mounted read-write and build-time code could plant an artifact there
 *           that every later build resolved. It is closed by there being no
 *           shared cache at all — each build resolves into its own repository,
 *           copied from a seed baked into the image (FR26, FR37, FR38).
 *
 *           These are the declarations rather than the behaviour. The behaviour
 *           was measured end-to-end on 2026-10-11 and is recorded in §3.2: 7 s
 *           and **0 downloads** against the shared cache's 67 s and 665
 *           downloads cold, and 9 s warm. What a case can hold cheaply and
 *           for ever is that the mount has not come back, that the pins are
 *           where both readers look, and that the files parse — which is not
 *           rhetorical: `settings.xml` was rejected by Maven with
 *           *Non-parseable settings* because an XML comment contained `--`,
 *           and nothing but a parse would have caught it.
 *           B7-3 reads the pins the way the readers do (#33, 2026-11-03):
 *           `seed.sh` and `build.sh` splice `sed '/<!--/,/-->/d'`'s output, and
 *           that range ends at the next *later* line holding `-->`, so a
 *           one-line comment on a plugin line deletes the plugin and every line
 *           after it -- which the old check, counting names on the raw file,
 *           could not see. `stripComment` restates that rule and `commentFault`
 *           restates XML 1.0 §2.5, each in TypeScript; the `xml.etree` parse is
 *           kept for what neither reaches, and runs only where there is a
 *           `python3`.
 *           B7-4 is the notice about the directory the move left behind
 *           (`config/scripts/start/nar-builder.sh`), read as text. Until #32
 *           it told the operator *"you can delete it"*, which fails on rootless
 *           Docker -- the tree is the build user's mapped uid, 101499 -- and
 *           the old case here pinned that phrase as the requirement while
 *           refusing `rm -rf` anywhere in the file, printed text included, so
 *           a notice printing the command that works would have gone red. The
 *           rewritten rows (2026-11-03, FR43) read the printed lines apart
 *           from the code: the `echo` must carry the containerised removal,
 *           with the path single-quoted as a parameter expansion (the review
 *           of #32, the same day: double quotes carry a space but not a `$`,
 *           a backtick or a `"`), and the code must still run nothing. What
 *           the script prints at run time, and whether a shell reads it back
 *           as one argument, is B7-10, in tests/unit/m-b7.stale-cache-notice.test.ts.
 * Given:    compose.yml, config/nar_builder/{Dockerfile,build.sh,seed.sh,
 *           lifecycle-pins.xml,BuildServer.java},
 *           config/scripts/start/nar-builder.sh and scripts/linux/start.sh.
 * When:     Each is read as text; the pins file is stripped as the readers
 *           strip it, scanned for comment faults, and -- where PYTHON3 holds --
 *           parsed as XML; `stripComment` and `commentFault` are also fed the
 *           fixtures below. For the
 *           notice, the `echo` lines are read with their shell escapes
 *           resolved, and the rest of the script with comment lines **and**
 *           lines beginning `echo` or `printf` dropped.
 * Then:     No /m2 mount is declared anywhere; the seeding step is invoked by
 *           the image build with one version argument; build.sh copies the seed
 *           per build and splices the pins; the stripped pins begin at
 *           `<build>`, end at `</build>` and name every plugin the default
 *           lifecycle binds, each at a version; the raw file has no comment
 *           fault and parses; the notice's `echo` lines carry
 *           `docker run --pull never --rm --entrypoint rm -v
 *           '${<var>}/volumes/nar_builder:/v' liquidupstart/nar-builder:latest
 *           -rf /v/m2` with `rmdir '${<var>}/volumes/nar_builder'` on the line
 *           after -- single quotes, any identifier for `<var>`, the same in both
 *           (this said double quotes until the second review of #32, 2026-11-03,
 *           after the body and the row had moved on) -- the old phrase, `$PWD`
 *           and `alpine` are absent, the
 *           stripped code holds neither `rm` nor `docker` and still has the
 *           guard `if [ -d "$STALE" ]`, and start.sh invokes the script inside
 *           its `LIQUID_ON` block; each build user is created with an
 *           empty, root-owned 555 home, and is the user the server hands a slot
 *           (B7-6, #31); and the sweep's removal runs `rm` through `-execdir`,
 *           never `-exec`, so no path is resolved twice as root (B7-6, the
 *           second review of #55).
 * Covers:   B7-1, B7-2, B7-3, B7-4, B7-6, FR26, FR37, FR38, FR39, FR41, FR42, FR43;
 *           SP-2 for the voiced skip of the parse
 * Precondition: PYTHON3 -- `python3` on PATH, for the `xml.etree` parse alone.
 *           Where it is absent the parse is skipped and the `SP-2` line says so;
 *           the Linux test recipe's container lacks it unless it is added.
 * Unhappy:  B7-1's negative half is the mount coming back, by any spelling.
 *           B7-3's is a pins file that parses but has lost a plugin, which is
 *           how the first attempt failed: with resources, compiler, jar and
 *           surefire pinned a build still refused on maven-install-plugin,
 *           whose goal `package` never reaches. And since #33, a plugin hidden
 *           by a one-line comment on its own line; a `--` inside a comment, or
 *           inside a second comment after a proper one, a comment closed by
 *           `--->`, and one never closed -- `<!--->` among them.
 *           B7-4's are the bare phrase (or `$PWD`, or `alpine`) coming back,
 *           and a `rm` or `docker` appearing in the code rather than in what
 *           it prints -- a start script removing a directory the operator may
 *           have copied into is the thing the notice exists instead of.
 *           B7-6's third is a removal through `-exec`, which the review raced
 *           into deleting a root-owned `/victim`; the race is timing, so the
 *           declaration is held and the measurement is FR42's.
 *
 * Test data for B7-3 (#33): the real file -- a 45-line comment with em-dashes
 * and no `--`, then `<build>` to `</build>` with the eight plugins one per line.
 * HIDDEN puts `<!-- pinned -->` on the install line and must strip to
 * `<build>\n  <plugins>\n`; REARM, two multi-line comments around `b`, must
 * strip to `a\nb\nc\n` -- both measured with sed in the builder image.
 * `commentFault` refuses `<!-- a -- b -->`, `<!-- a --->`, `<!-- never
 * closed` and `<!--->`, each with `<build/>` after it, and `<!-- a -->` followed
 * by `<!-- b -- c -->` -- the one fixture with two comments, since a helper that
 * stopped after the first passed every other (the review of #64, 2026-11-04) --
 * and accepts `<!-- a - b -->` and the real file: the same answers Python's
 * `xml.etree` gave on each, 2026-11-03 and 2026-11-04.
 *
 * Test data for B7-4: the command is matched as one pattern, so the flag order
 * (`--pull never` straight after `run`, CS-22's shape), the image and the single
 * quotes around the path are each held; the expansion inside them may be any
 * identifier, `${<var>}`, and the `rmdir` line must use the same one. `alpine` is
 * what BACKLOG.md once offered -- a public image not already local, which would
 * be pulled to run one `rm`.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';
import { PYTHON3 } from '../lib/preconditions';

const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');
/**
 * The script with its comment lines removed.
 *
 * Asserting that a shell script does *not* contain something has to be done
 * against the code, because the comment explaining why it is not there contains
 * it. `cp -al` is exactly that: `repo_for`'s comment says a hardlink farm would
 * reopen the write path, so a naive `not.toContain` matched the explanation and
 * failed. The same shape as the `refused:` reader in m-b1.refusal-next-step.
 */
const code = (p: string) =>
  read(p)
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
const compose = read('compose.yml');
const dockerfile = read('config/nar_builder/Dockerfile');
const buildSh = read('config/nar_builder/build.sh');
const seedSh = read('config/nar_builder/seed.sh');
const pinsPath = 'config/nar_builder/lifecycle-pins.xml';
const pins = read(pinsPath);

test('B7-1 no shared Maven cache is mounted into any service, by any spelling', () => {
  // Matched on the container side of the mount rather than on the host path, so
  // moving the host directory does not let the mount back in unnoticed.
  const mounts = compose
    .split('\n')
    .filter((l) => /^\s*-\s+\S+:\S/.test(l))
    .filter((l) => /:\/m2(:|\s*$)/.test(l));
  expect(mounts).toEqual([]);
  // And the image does not create the directory either, so a stray mount would
  // not land on a prepared path.
  expect(code('config/nar_builder/Dockerfile')).not.toMatch(/mkdir[^\n]*\s\/m2(\s|\\|$)/m);
});

test('B7-1 and each build resolves into its own repository, copied from the seed', () => {
  // The three things that make it per-build: the repository lives under the
  // build's own work directory, it starts as a copy of the seed, and nothing
  // names a shared path.
  expect(buildSh).toContain('d="${1}/m2"');
  expect(buildSh).toContain('cp -a "$SEED" "$d"');
  expect(code('config/nar_builder/build.sh')).not.toContain('CACHE=/m2');
  // A hardlink farm would share inodes with the seed and reopen the write path
  // the whole change exists to close.
  expect(code('config/nar_builder/build.sh')).not.toMatch(/cp\s+-al\b/);
});

test('B7-2 the image build owns the seeding step, with the api version resolved rather than passed', () => {
  expect(dockerfile).toMatch(/RUN\s+\/opt\/builder\/seed\.sh/);
  // One version argument. Two was a defect: NiFi 2.11.0 ships nifi-api 2.10.0
  // (FR27), the Dockerfile defaulted the api version to the NiFi version, and
  // the build then deployed while the seed served almost none of it.
  expect(dockerfile).toContain('ARG SEED_NIFI_VERSION');
  expect(dockerfile).not.toContain('ARG SEED_NIFI_API_VERSION');
  expect(seedSh).toContain('nifi-api:jar');
  // The seed must not be writable by the build user, so it is not chowned to it.
  expect(code('config/nar_builder/Dockerfile')).not.toMatch(/chown[^\n]*builder[^\n]*m2-seed/);
});

/**
 * The pins as the readers splice them. `seed.sh:92` and `build.sh:445` run
 * `sed '/<!--/,/-->/d'`, and GNU sed's range ends at the next **later** line
 * holding `-->` -- so a one-line `<!-- x -->` deletes its own line and everything
 * up to the next `-->`, or to the end of the file. After a close, the next line
 * holding `<!--` opens another range. Measured in the builder image, 2026-11-03.
 */
const stripComment = (text: string): string => {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const kept: string[] = [];
  let open = false;
  for (const l of lines) {
    if (open) {
      if (l.includes('-->')) open = false;
    } else if (l.includes('<!--')) {
      open = true;
    } else {
      kept.push(l);
    }
  }
  return kept.map((l) => `${l}\n`).join('');
};

type CommentFault = { fault: '--' | 'open'; at: number } | null;
/**
 * The first comment fault in the raw text, or null. XML 1.0 §2.5: a comment's
 * text may not hold `--`, so the first `--` after the four characters of the
 * opener has to be the closer's, immediately followed by `>`. Searched from the
 * opener itself it would find the opener's own `--` and refuse every comment.
 */
const commentFault = (text: string): CommentFault => {
  let at = text.indexOf('<!--');
  while (at !== -1) {
    const dash = text.indexOf('--', at + 4);
    if (dash === -1) return { fault: 'open', at };
    if (text[dash + 2] !== '>') return { fault: '--', at: dash };
    at = text.indexOf('<!--', dash + 3);
  }
  return null;
};

const PLUGINS = [
  'maven-resources-plugin',
  'maven-compiler-plugin',
  'maven-jar-plugin',
  'maven-surefire-plugin',
  'maven-install-plugin',
  'maven-deploy-plugin',
  'maven-clean-plugin',
  'maven-site-plugin'
];
// `maven-install-plugin` because it is the plugin the first attempt missed.
const HIDDEN =
  '<build>\n  <plugins>\n    <plugin><!-- pinned --><artifactId>maven-install-plugin</artifactId><version>3.2.0</version></plugin>\n    <plugin><artifactId>maven-site-plugin</artifactId><version>3.12.1</version></plugin>\n  </plugins>\n</build>\n';
const REARM = 'a\n<!--\nx\n-->\nb\n<!--\ny\n-->\nc\n';

test('B7-3 the pins file, with its comment stripped as the readers strip it, names every plugin the default lifecycle binds, each at a version', () => {
  // Including the goals `package` never executes: with resources, compiler, jar
  // and surefire pinned, a build still refused on maven-install-plugin. Read off
  // the stripped text, since that is what Maven gets; until #33 it was the raw file.
  const stripped = stripComment(pins);
  const pinned = [...stripped.matchAll(/<artifactId>(maven-[a-z]+-plugin)<\/artifactId><version>([^<]+)</g)];
  const versions = new Map(pinned.map(([, name, version]) => [name, version]));
  for (const plugin of PLUGINS) expect(versions.get(plugin) ?? `${plugin} unpinned`).toMatch(/^\d+\.\d+/);
  expect(pinned.length).toBeGreaterThanOrEqual(8);
});

test('B7-3 the negative: a plugin on a line that also opens a comment is not counted, and nothing after that line is either', () => {
  // The third line opens a range and no later line holds `-->`. sed prints these
  // 20 bytes in the builder image. Python parses the fragment: the defect is only
  // in what the readers splice.
  const stripped = stripComment(HIDDEN);
  expect(stripped).toBe('<build>\n  <plugins>\n');
  expect(stripped).not.toContain('maven-install-plugin');
  expect(stripped).not.toContain('maven-site-plugin');
  expect(stripped).not.toContain('</build>');
});

test('B7-3 the real file, stripped the same way, begins at <build>, ends at </build> and still holds all eight', () => {
  const stripped = stripComment(pins);
  expect(stripped.startsWith('<build>\n')).toBe(true);
  expect(stripped.endsWith('</build>\n')).toBe(true);
  for (const plugin of PLUGINS) expect(stripped).toContain(`<artifactId>${plugin}</artifactId>`);
});

test('B7-3 and a second comment after the first is stripped too: the range re-arms', () => {
  // The first range closes on its `-->`; the second `<!--` must open another,
  // or `y` is spliced into the pom. sed: `a\nb\nc\n`.
  expect(stripComment(REARM)).toBe('a\nb\nc\n');
});

test('B7-3 the negative: a -- inside an XML comment is refused, in TypeScript and without a parser', () => {
  // `settings.xml` was refused by Maven with *Non-parseable settings* for this.
  // Python: invalid token, line 1, column 9.
  expect(commentFault('<!-- a -- b -->\n<build/>')).toEqual({ fault: '--', at: 7 });
});

test('B7-3 the negative: a -- in a second comment, after one that closed properly, is refused', () => {
  // The walk past the first comment. Every other fixture and the real file hold
  // one, so `while` read as `if` passed them all -- the review of #64,
  // 2026-11-04. 18 is the second comment's `--`. Python: line 2, column 9.
  expect(commentFault('<!-- a -->\n<!-- b -- c -->\n<build/>')).toEqual({ fault: '--', at: 18 });
});

test('B7-3 the negative: a comment closed by ---> is refused', () => {
  // The first `--` after the opener is followed by `-`. Python: line 1, column 9.
  expect(commentFault('<!-- a --->\n<build/>')).toEqual({ fault: '--', at: 7 });
});

test('B7-3 the negative: a comment opened and never closed is refused', () => {
  // Under the readers' sed it would swallow the file to its end. Python: unclosed
  // token, line 1, column 0.
  expect(commentFault('<!-- never closed\n<build/>')).toEqual({ fault: 'open', at: 0 });
  // And `<!--->`: past the opener's four characters the text is `->`, so nothing
  // closes it. A search starting three characters in finds the opener's own
  // `--` and reads it as closed -- the review of #64, 2026-11-04. Python: the
  // same unclosed token, line 1, column 0.
  expect(commentFault('<!--->\n<build/>')).toEqual({ fault: 'open', at: 0 });
});

test('B7-3 a single - inside a comment is accepted', () => {
  // The fault is two characters; the counterpart carries one. Python parses it.
  expect(commentFault('<!-- a - b -->\n<build/>')).toBeNull();
});

test("B7-3 and the real file's comment holds no fault", () => {
  // Its prose carries em-dashes. The row a `--` put back into the comment reddens.
  expect(commentFault(pins)).toBeNull();
});

test.skipIf(!PYTHON3)('B7-3 where PYTHON3 holds, the whole file parses in xml.etree', () => {
  // For what a hand-written rule does not reach: a mismatched tag, an undefined
  // entity, an unquoted attribute, two roots.
  const parsed = sh([
    PYTHON3,
    '-c',
    'import sys,xml.etree.ElementTree as ET; ET.parse(sys.argv[1])',
    join(repoRoot, pinsPath)
  ]);
  expect(parsed.code).toBe(0);
  expect(parsed.stderr).toBe('');
});

test.skipIf(!!PYTHON3)('SP-2 the parse in this file needs python3 on PATH, which is absent here', () => {
  // Filed under the rule, so a bare host's report never shows a B7-3 pass for a
  // parse that did not run.
  expect(PYTHON3).toBe('');
});

test('B7-3 and both readers take the pins from this one file', () => {
  // One declaration, two readers: if the seeding step and the build could pin
  // differently, the seed would be the closure of a build that never runs.
  expect(seedSh).toContain('lifecycle-pins.xml');
  expect(buildSh).toContain('PINS=/opt/builder/lifecycle-pins.xml');
  expect(buildSh).toContain('${pins}');
  expect(dockerfile).toContain('COPY lifecycle-pins.xml');
});

const NOTICE = 'config/scripts/start/nar-builder.sh';
const PRINTED = /^\s*(echo|printf)\b/;
/** The notice's printed lines, as the operator reads them: `\"` resolved to `"`. */
const printed = () =>
  read(NOTICE)
    .split('\n')
    .filter((l) => PRINTED.test(l))
    .map((l) => l.replace(/\\"/g, '"'));
/** The notice's code: no comment lines and no printed lines. */
const noticeCode = () =>
  read(NOTICE)
    .split('\n')
    .filter((l) => !/^\s*#/.test(l) && !PRINTED.test(l))
    .join('\n');

test('B7-4 the stale host directory is named, with the containerised removal printed: --pull never, the builder image, the project path single-quoted', () => {
  // Named, so an installation that ran before the move is told the directory is
  // dead rather than left to wonder -- and told the command that removes it,
  // since on rootless Docker a plain rm by the host user is refused (FR43).
  // Single quotes, because the operator's shell -- bash, zsh, dash, ash -- reads
  // them alike and literally; the review of #32 found double quotes, which lose
  // a `$b` to expansion and run what follows a backtick.
  const lines = printed();
  expect(lines.join('\n')).toContain('volumes/nar_builder/m2');
  const COMMAND =
    /docker run --pull never --rm --entrypoint rm -v '\$\{([A-Za-z_][A-Za-z0-9_]*)\}\/volumes\/nar_builder:\/v' liquidupstart\/nar-builder:latest -rf \/v\/m2/;
  const at = lines.findIndex((l) => COMMAND.test(l));
  expect(at).toBeGreaterThanOrEqual(0);
  const variable = lines[at].match(COMMAND)![1];
  // The parent the container cannot remove -- its own mount point -- on the next
  // line, quoted the same way, from the same expansion.
  expect(lines[at + 1] ?? '').toContain(`rmdir '\${${variable}}/volumes/nar_builder'`);
});

test('B7-4 the negative: the bare phrase is gone, and so are $PWD and alpine', () => {
  const notice = read(NOTICE);
  expect(notice).not.toContain('you can delete it');
  // The operator pastes the line from wherever they read it, so the path is the
  // project's, resolved -- not whatever directory they happen to stand in.
  expect(notice).not.toContain('$PWD');
  expect(notice).not.toMatch(/alpine/);
});

test('B7-4 the negative: with comment and printed lines stripped the script runs nothing and removes nothing, and the guard is still there', () => {
  // The old assertion refused `rm -rf` over the whole file, printed text
  // included, which barred the fix. Removing a directory the operator may have
  // copied into is still not a start script's call -- the same shape and reason
  // as liquid.sh's notice about volumes/liquid/api -- so the code, with what it
  // prints set apart, must not run rm or docker.
  const code = noticeCode();
  expect(code).not.toMatch(/\brm\b/);
  expect(code).not.toMatch(/\bdocker\b/);
  // It only speaks when there is something to speak about.
  expect(code).toMatch(/if \[ -d "\$STALE" \]/);
});

test('B7-4 start.sh invokes it, inside the LIQUID_ON block', () => {
  // The image the notice names is only guaranteed present when Liquid is on
  // (CS-23), and the notice is only worth having if it runs.
  const start = read('scripts/linux/start.sh');
  const open = start.indexOf('if [[ $LIQUID_ON -eq 1 ]]; then');
  expect(open).toBeGreaterThanOrEqual(0);
  const close = start.indexOf('\nfi\n', open);
  expect(close).toBeGreaterThan(open);
  expect(start.slice(open, close)).toContain('"${PROJECT_DIR}/config/scripts/start/nar-builder.sh"');
});

/**
 * The Dockerfile's instructions, comments dropped and continuation lines joined,
 * so a `useradd` and the `install` that follows it on the next line read as the
 * one RUN they are.
 */
const dockerRuns = () =>
  code('config/nar_builder/Dockerfile').replace(/\\\n/g, ' ').split(/\s*&&\s*|\n/);

/** The Java source with its comment lines dropped, for the same reason as `code()`. */
const javaCode = (p: string) =>
  read(p)
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

test('B7-6 each build user is created with no home of its own and given an empty, root-owned 555 one', () => {
  // #31. `useradd -m` copies /etc/skel in builder-owned, and a chown of the
  // directory alone afterwards leaves `.bashrc` and `.profile` writable --
  // measured against the fix the issue first proposed.
  const adds = dockerRuns().filter((c) => /\buseradd\b/.test(c));
  const users = adds.map((c) => c.trim().split(/\s+/).pop());
  expect(users).toEqual(['builder', 'builder2']);
  for (const c of adds) {
    expect(c).toMatch(/\s-M\s/);
    expect(c).not.toMatch(/\s-m\s/);
  }
  const installs = dockerRuns().filter((c) => /^\s*install -d -m 555 -o root -g root\s/.test(c));
  for (const u of users) {
    expect(installs.some((c) => c.split(/\s+/).includes(`/home/${u}`))).toBe(true);
  }
});

test('B7-6 and the server\'s slot users are exactly the users the image creates', () => {
  // Compared file with file rather than against a list of the case's own, so
  // two files that agree with the test and not with each other cannot pass.
  // A slot user the image lacks fails every build on that slot; until 2026-11-02
  // it made run_maven run Maven as root instead. B7-7 (7).
  const server = javaCode('config/nar_builder/BuildServer.java');
  const decl = server.match(/SLOT_USERS\s*=\s*List\.of\(([^)]*)\)/);
  expect(decl).not.toBeNull();
  const slots = [...decl![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  const users = dockerRuns()
    .filter((c) => /\buseradd\b/.test(c))
    .map((c) => c.trim().split(/\s+/).pop()!)
    .sort();
  expect(slots.length).toBe(2);
  expect(slots).toEqual(users);
});

test('B7-6 and the sweep\'s removal runs rm from the directory find holds, never on a path resolved again', () => {
  // `-exec` hands rm an absolute path resolved again when rm runs, and the other
  // slot's build can swap a symlink to / into it meanwhile -- raced into removing
  // a root-owned /victim. `-execdir` gives rm `./<name>` in the directory find
  // holds open. FR42, the second review of #55.
  const server = javaCode('config/nar_builder/BuildServer.java');
  const lists = [...server.matchAll(/List\.of\(([^;]*?)\)\);/g)].map((m) =>
    [...m[1].matchAll(/"([^"]*)"/g)].map((q) => q[1])
  );
  const removal = lists.filter((args) => args.includes('-prune'));
  expect(removal.length).toBe(1);
  const args = removal[0];
  const at = args.indexOf('-execdir');
  expect(at).toBeGreaterThanOrEqual(0);
  expect(args.slice(at, at + 3)).toEqual(['-execdir', 'rm', '-rf']);
  expect(args).not.toContain('-exec');
});
