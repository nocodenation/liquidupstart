#!/usr/bin/env python3
import io
import os
import struct
import sys
import zipfile
import zlib

NIFI_PREFIX = "org/apache/nifi/"
BUNDLED_DIRS = ("NAR-INF/bundled-dependencies/", "META-INF/bundled-dependencies/")

# How many bytes of class files one bundle may declare before it is refused
# unread.
#
# `bundle_classes` holds every class file's bytes at once, so the constant pool
# can be parsed, and had no cap: a bundle could ask this process for as much
# memory as its central directory declared. Measured over the stock image, the
# largest real bundle declares **187.2 MB** of classes -- nifi-aws-nar-2.11.0.nar
# -- so 512 MiB is 2.7 times the worst thing this stack actually ships. A lower
# number would refuse that bundle, and a false refusal is what the documents
# themselves call worse than no check.
#
# Read off the central directory, before anything is unpacked, so a declaration
# of 600 MB costs nothing to refuse. Minor of the 2026-10-01 review.
MAX_CLASS_BYTES = 512 << 20

FIXED_WIDTH = {
    3: 4, 4: 4, 9: 4, 10: 4, 11: 4, 12: 4, 17: 4, 18: 4,
    5: 8, 6: 8,
    8: 2, 16: 2, 19: 2, 20: 2,
    15: 3,
}


class Unreadable(Exception):
    pass


def _descriptor_to_name(raw):
    name = raw
    while name.startswith("["):
        name = name[1:]
    if name.startswith("L") and name.endswith(";"):
        name = name[1:-1]
    return name


def _types_in_descriptor(raw):
    """Every object type named in a descriptor or a generic signature."""
    found = set()
    i = 0
    while True:
        j = raw.find("L", i)
        if j == -1:
            break
        k = raw.find(";", j)
        if k == -1:
            break
        name = raw[j + 1:k]
        # A generic signature carries type arguments inside <>; the outer name
        # ends at the first < if there is one before the ;.
        lt = name.find("<")
        if lt != -1:
            name = name[:lt]
        if name and "/" in name:
            found.add(name)
        i = j + 1
    return found


def _descriptor_indices(data, pos, utf8, where):
    """Walk past the constant pool and collect every descriptor and Signature.

    Only CONSTANT_Class entries were read before, so a type that appears solely
    in a method or field signature was invisible -- and that is exactly the
    failure FR23 and FR36 measured: NoClassDefFoundError at
    Class.getDeclaredMethods0, which is descriptor resolution when NiFi reflects
    over the processor. Blocker 5 of the 2026-09-28 review. String literals stay
    out, which is why this walks the structure rather than scanning every UTF-8
    constant."""
    out = set()
    try:
        pos += 6                                   # access_flags, this_class, super_class
        ifaces = struct.unpack_from(">H", data, pos)[0]
        pos += 2 + 2 * ifaces

        def attributes(pos):
            n = struct.unpack_from(">H", data, pos)[0]
            pos += 2
            for _ in range(n):
                name_i = struct.unpack_from(">H", data, pos)[0]
                length = struct.unpack_from(">I", data, pos + 2)[0]
                pos += 6
                if utf8.get(name_i) == "Signature" and length == 2:
                    sig_i = struct.unpack_from(">H", data, pos)[0]
                    if sig_i in utf8:
                        out.update(_types_in_descriptor(utf8[sig_i]))
                pos += length
            return pos

        for _ in range(2):                         # fields, then methods
            n = struct.unpack_from(">H", data, pos)[0]
            pos += 2
            for _ in range(n):
                desc_i = struct.unpack_from(">H", data, pos + 4)[0]
                pos += 6
                if desc_i in utf8:
                    out.update(_types_in_descriptor(utf8[desc_i]))
                pos = attributes(pos)
        attributes(pos)                            # class-level attributes
    except (struct.error, IndexError) as exc:
        raise Unreadable("%s: the class body could not be parsed (%s)" % (where, exc))
    return out


def class_references(data, where):
    if len(data) < 10:
        raise Unreadable("%s: %d bytes is too short to be a class file" % (where, len(data)))
    if data[:4] != b"\xca\xfe\xba\xbe":
        raise Unreadable(
            "%s: does not begin with 0xCAFEBABE, it begins with 0x%s"
            % (where, data[:4].hex())
        )
    try:
        count = struct.unpack_from(">H", data, 8)[0]
        pos = 10
        utf8 = {}
        class_indices = []
        index = 1
        while index < count:
            tag = data[pos]
            pos += 1
            if tag == 1:
                length = struct.unpack_from(">H", data, pos)[0]
                pos += 2
                if pos + length > len(data):
                    raise Unreadable("%s: constant %d runs past the end of the file" % (where, index))
                utf8[index] = data[pos:pos + length].decode("utf-8", "replace")
                pos += length
            elif tag == 7:
                class_indices.append(struct.unpack_from(">H", data, pos)[0])
                pos += 2
            elif tag in FIXED_WIDTH:
                pos += FIXED_WIDTH[tag]
            else:
                raise Unreadable("%s: constant %d carries unknown tag %d" % (where, index, tag))
            if pos > len(data):
                raise Unreadable("%s: constant %d runs past the end of the file" % (where, index))
            index += 2 if tag in (5, 6) else 1
    except Unreadable:
        raise
    except (struct.error, IndexError) as exc:
        raise Unreadable("%s: the constant pool could not be parsed (%s)" % (where, exc))

    found = set()
    for i in class_indices:
        if i not in utf8:
            raise Unreadable("%s: a class constant points at %d, which is not a name" % (where, i))
        name = _descriptor_to_name(utf8[i])
        if name.startswith(NIFI_PREFIX):
            found.add(name)
    for name in _descriptor_indices(data, pos, utf8, where):
        if name.startswith(NIFI_PREFIX):
            found.add(name)
    return found


# What a broken archive throws. zlib.error comes out of a corrupt deflate stream
# and NotImplementedError out of a compression method this Python cannot read;
# neither was caught, so a damaged bundle printed a traceback where every other
# refusal prints a sentence. It still failed closed -- the check exited non-zero
# -- but the operator was handed a stack trace instead of a reason. Minor of the
# 2026-09-28 review.
ZIP_ERRORS = (zipfile.BadZipFile, OSError, RuntimeError, zlib.error, NotImplementedError)

def _open_zip(data, where):
    try:
        return zipfile.ZipFile(io.BytesIO(data))
    except ZIP_ERRORS as exc:
        raise Unreadable("%s: could not be opened as an archive (%s)" % (where, exc))


def _read(zf, name, where):
    try:
        return zf.read(name)
    except ZIP_ERRORS as exc:
        raise Unreadable("%s: could not be read out of the archive (%s)" % (where, exc))


def _class_names(zf):
    return set(n[:-6] for n in zf.namelist() if n.endswith(".class"))


def _bundled_jars(zf):
    return [n for n in zf.namelist() if n.endswith(".jar") and n.startswith(BUNDLED_DIRS)]


def bundle_class_names(path):
    """Every class the NAR carries, by name, without reading any of them.

    `bundle_classes` holds every class file's bytes so the constant pool can be
    parsed; the index only needs the names, and the largest bundle the stock image
    ships declares 196 MB of them. Written for the parent index S1 of the
    2026-10-01 review added, and it is what a names-only caller should use."""
    with open(path, "rb") as fh:
        data = fh.read()
    names = set()
    root = _open_zip(data, os.path.basename(path))
    for name in zf_names(root):
        names.add(name[:-6])
    for jar in sorted(_bundled_jars(root)):
        where = "%s!%s" % (os.path.basename(path), jar)
        inner = _open_zip(_read(root, jar, where), where)
        for name in zf_names(inner):
            names.add(name[:-6])
    return names


def _declared_class_bytes(zf):
    return sum(i.file_size for i in zf.infolist() if i.filename.endswith(".class"))


def bundle_classes(path):
    """Every class the NAR carries, as {name: (data, where)}, its own and its bundled jars'."""
    with open(path, "rb") as fh:
        data = fh.read()
    carried = {}
    base = os.path.basename(path)
    root = _open_zip(data, base)
    # The budget is taken from the central directory and checked before each read,
    # so a bundle that declares more than MAX_CLASS_BYTES is refused without any
    # of it being unpacked.
    budget = _declared_class_bytes(root)
    for jar in sorted(_bundled_jars(root)):
        where = "%s!%s" % (base, jar)
        budget += _declared_class_bytes(_open_zip(_read(root, jar, where), where))
        if budget > MAX_CLASS_BYTES:
            break
    if budget > MAX_CLASS_BYTES:
        raise Unreadable(
            "%s: the classes it carries declare %d bytes, past the %d-byte limit; "
            "nothing here will unpack it" % (base, budget, MAX_CLASS_BYTES)
        )
    for name in sorted(zf_names(root)):
        carried[name[:-6]] = (_read(root, name, "%s!%s" % (base, name)),
                              "%s!%s" % (base, name))
    for jar in sorted(_bundled_jars(root)):
        where = "%s!%s" % (base, jar)
        inner = _open_zip(_read(root, jar, where), where)
        for name in sorted(zf_names(inner)):
            carried[name[:-6]] = (_read(inner, name, "%s!%s" % (where, name)),
                                  "%s!%s" % (where, name))
    return carried


def nar_parent(path):
    """The NAR this one declares as its parent, as (group, id, version) or None.

    A NAR inherits its parent's classes at runtime -- that is what the chain is
    for -- so a reference the parent provides resolves in Liquid and must
    resolve here. Without this, narcheck refused 11 of the 118 NARs the stock
    image ships, including nifi-standard-nar. A false refusal is what the docs
    themselves call worse than no check. Blocker 3 of the 2026-09-28 review."""
    try:
        with open(path, "rb") as fh:
            data = fh.read()
        zf = _open_zip(data, os.path.basename(path))
        raw = zf.read("META-INF/MANIFEST.MF").decode("utf-8", "replace")
    except (KeyError, Unreadable) + ZIP_ERRORS:
        return None
    # Manifest continuation lines begin with a single space.
    unfolded = raw.replace("\r\n", "\n").replace("\n ", "")
    fields = {}
    for line in unfolded.split("\n"):
        if ":" in line:
            k, v = line.split(":", 1)
            fields[k.strip().lower()] = v.strip()
    gid = fields.get("nar-dependency-group")
    aid = fields.get("nar-dependency-id")
    ver = fields.get("nar-dependency-version")
    if not aid:
        return None
    return (gid or "", aid, ver or "")


def parent_chain_classes(path, lib_dir, seen=None):
    """Every class the declared parent chain carries, by name."""
    if seen is None:
        seen = set()
    names = set()
    parent = nar_parent(path)
    if not parent:
        return names
    _, aid, ver = parent
    candidates = []
    if ver:
        candidates.append(os.path.join(lib_dir, "%s-%s.nar" % (aid, ver)))
    if os.path.isdir(lib_dir):
        candidates.extend(
            os.path.join(lib_dir, n) for n in sorted(os.listdir(lib_dir))
            if n.startswith(aid + "-") and n.endswith(".nar")
        )
    for cand in candidates:
        real = os.path.realpath(cand)
        if real in seen or not os.path.isfile(real):
            continue
        seen.add(real)
        try:
            names |= set(bundle_classes(real))
        except (Unreadable, OSError):
            continue
        names |= parent_chain_classes(real, lib_dir, seen)
        break
    return names


def zf_names(zf):
    return [n for n in zf.namelist() if n.endswith(".class")]


def lib_jars(lib_dir):
    if not os.path.isdir(lib_dir):
        return []
    return sorted(os.path.join(lib_dir, n) for n in os.listdir(lib_dir) if n.endswith(".jar"))


def lib_nars(lib_dir):
    if not os.path.isdir(lib_dir):
        return []
    return sorted(os.path.join(lib_dir, n) for n in os.listdir(lib_dir) if n.endswith(".nar"))


def jar_class_names(path):
    try:
        with zipfile.ZipFile(path) as zf:
            return _class_names(zf)
    except ZIP_ERRORS:
        return set()


def api_jars(lib_dir):
    return [p for p in lib_jars(lib_dir) if os.path.basename(p).startswith("nifi-api-")]


def provided_packages(lib_dir):
    packages = set()
    for jar in api_jars(lib_dir):
        for name in jar_class_names(jar):
            if name.startswith(NIFI_PREFIX):
                packages.add(name.rsplit("/", 1)[0])
    return packages


def lib_index(lib_dir):
    """The two sets the decision is made from: what lib/ can resolve, and which
    packages are the API's. Split out so the nar_builder can be handed the same
    two sets as text instead of 764MB of jars -- one decision, one implementation,
    two ways in."""
    resolvable = set()
    for jar in lib_jars(lib_dir):
        resolvable |= jar_class_names(jar)
    return resolvable, provided_packages(lib_dir)


def check(nar, lib_dir):
    """Returns a list of refusal lines. Empty means the bundle may be copied."""
    resolvable, judged = lib_index(lib_dir)
    # An empty `judged` means every reference is skipped by the filter below and
    # the bundle is permitted for having been judged against nothing. Measured in
    # S4 of the 2026-10-01 review: a NAR with its parent stripped is refused
    # against the full lib, and permitted against the same lib without its
    # nifi-api jar, and permitted against /does/not/exist. `index` mode already
    # refuses this condition; `check` said yes to it.
    #
    # The B4-3 positive control used an empty lib, so it could not tell
    # "permitted because sound" from "permitted because nothing is judged" --
    # which is why this shipped.
    if not judged:
        raise Unreadable(
            "%s holds no nifi-api-*.jar, so there is nothing to judge a reference against"
            % lib_dir
        )
    return check_against(nar, resolvable, judged, lib_dir, parent_chain_classes(nar, lib_dir))


def check_against(nar, lib_resolvable, judged, provider, parent_classes=frozenset()):
    # `provider` and not `where`: the loop below unpacks a `where` of its own out
    # of carried[owner], and a parameter by that name is silently overwritten --
    # which put the class file's path into the refusal where the library belongs.
    carried = bundle_classes(nar)
    resolvable = set(carried) | lib_resolvable | parent_classes
    unresolved = []
    for owner in sorted(carried):
        data, where = carried[owner]
        for ref in sorted(class_references(data, where)):
            if ref.rsplit("/", 1)[0] not in judged:
                continue
            if ref in resolvable:
                continue
            unresolved.append((owner, ref))
    if not unresolved:
        return []
    lines = []
    for owner, ref in unresolved:
        lines.append(
            "  %s references %s, which the bundle does not carry and %s does not provide."
            % (owner.replace("/", "."), ref.replace("/", "."), provider)
        )
    return lines


CLASSES_FILE = "lib-classes.txt"
PACKAGES_FILE = "api-packages.txt"
# The parent chain, written out so `check-index` can walk it without the NARs.
#
# `check` resolves a bundle's references against its declared parent as well --
# that is blocker 3 of the 2026-09-28 review, and without it narcheck refused 11
# of the 118 NARs the stock image ships. `check-index`, which is the mode
# `nar-build` runs, was given no parent at all, so the two sides answered
# differently: measured over the stock image, `check` refused 0 and `check-index`
# refused 11, citing KerberosUserService and FlowFileFilters. The comment at
# build.sh:8-11 promised one answer either way. S1 of the 2026-10-01 review.
#
# Two files rather than one so each line stays a pair: `<nar> <class>` and
# `<nar> <parent-artifact-id>`.
NAR_CLASSES_FILE = "nar-classes.txt"
NAR_PARENTS_FILE = "nar-parents.txt"

NEXT_STEP = (
    "Rebuild it against the API this Liquid loads and drop it in again. "
    "`nar-build --target` prints that version."
)


def main(argv):
    if len(argv) < 2:
        sys.stderr.write(
            "usage: narcheck.py refs <class-file>\n"
            "       narcheck.py check <nar> <lib-dir>\n"
            "       narcheck.py index <lib-dir> <out-dir>\n"
            "       narcheck.py check-index <nar> <index-dir>\n"
        )
        return 2
    mode = argv[0]
    if mode == "refs":
        with open(argv[1], "rb") as fh:
            data = fh.read()
        try:
            for name in sorted(class_references(data, os.path.basename(argv[1]))):
                sys.stdout.write(name + "\n")
        except Unreadable as exc:
            sys.stderr.write("UNREADABLE %s\n" % exc)
            return 2
        return 0
    if mode == "index":
        # Write what a reader elsewhere needs to make the same decision. Produced
        # by the same functions that read lib/ directly, so the two cannot drift.
        if len(argv) != 3:
            sys.stderr.write("usage: narcheck.py index <lib-dir> <out-dir>\n")
            return 2
        lib_dir, out_dir = argv[1], argv[2]
        resolvable, judged = lib_index(lib_dir)
        if not judged:
            sys.stderr.write("no nifi-api jar in %s; nothing to write\n" % lib_dir)
            return 2
        with open(os.path.join(out_dir, CLASSES_FILE), "w") as fh:
            fh.write("\n".join(sorted(resolvable)) + "\n")
        with open(os.path.join(out_dir, PACKAGES_FILE), "w") as fh:
            fh.write("\n".join(sorted(judged)) + "\n")
        # What each NAR carries in a judged package, and what it calls its parent.
        # Only judged packages: those are the only names check_against compares,
        # so the rest would be weight without effect.
        nar_classes = []
        nar_parents = []
        for nar in sorted(lib_nars(lib_dir)):
            base = os.path.basename(nar)
            try:
                names = bundle_class_names(nar)
            except Unreadable:
                # A NAR the index cannot read is left out of the chain rather than
                # silently treated as empty: a bundle whose parent is unreadable is
                # then refused by check-index, which is the closed failure.
                continue
            for name in sorted(names):
                if name.rsplit("/", 1)[0] in judged:
                    nar_classes.append("%s %s" % (base, name))
            parent = nar_parent(nar)
            if parent:
                nar_parents.append("%s %s" % (base, parent[1]))
        with open(os.path.join(out_dir, NAR_CLASSES_FILE), "w") as fh:
            fh.write("\n".join(nar_classes) + "\n")
        with open(os.path.join(out_dir, NAR_PARENTS_FILE), "w") as fh:
            fh.write("\n".join(nar_parents) + "\n")
        sys.stdout.write(
            "%d classes, %d api packages, %d parent links, %d chain classes\n"
            % (len(resolvable), len(judged), len(nar_parents), len(nar_classes))
        )
        return 0
    if mode == "check-index":
        if len(argv) != 3:
            sys.stderr.write("usage: narcheck.py check-index <nar> <index-dir>\n")
            return 2
        nar, index_dir = argv[1], argv[2]
        try:
            with open(os.path.join(index_dir, CLASSES_FILE)) as fh:
                resolvable = set(fh.read().split())
            with open(os.path.join(index_dir, PACKAGES_FILE)) as fh:
                judged = set(fh.read().split())
            # The parent chain, read from the same index. A chain that cannot be
            # read must not quietly become empty -- that is how this mode came to
            # refuse 11 stock NARs while `check` refused none -- so a missing or
            # unreadable file takes the same refusal as a missing class index.
            chain_of = {}
            parent_of = {}
            with open(os.path.join(index_dir, NAR_CLASSES_FILE)) as fh:
                for line in fh:
                    base, _, name = line.strip().partition(" ")
                    if base and name:
                        chain_of.setdefault(base, set()).add(name)
            with open(os.path.join(index_dir, NAR_PARENTS_FILE)) as fh:
                for line in fh:
                    base, _, aid = line.strip().partition(" ")
                    if base and aid:
                        parent_of[base] = aid
        except OSError as exc:
            sys.stdout.write("REFUSED %s\n" % nar)
            sys.stdout.write("  the index of what Liquid can load is not readable: %s\n" % exc)
            sys.stdout.write(
                "  Without it nothing here can tell a sound bundle from a broken one.\n"
                "  Silence is not consent: it is not deployed.\n"
            )
            return 1
        # The same matching rule as parent_chain_classes: the parent is named by
        # artifact id, and a NAR whose basename starts with `<aid>-` is it. Walked
        # rather than followed once, because a parent may declare a parent, and
        # guarded against a cycle by the set of names already taken.
        parent_classes = set()
        aid = None
        try:
            parent = nar_parent(nar)
            aid = parent[1] if parent else None
        except Unreadable:
            aid = None
        taken = set()
        while aid:
            nxt = None
            for base in sorted(chain_of):
                if base in taken or not base.startswith(aid + "-"):
                    continue
                taken.add(base)
                parent_classes |= chain_of[base]
                nxt = parent_of.get(base)
            for base in sorted(parent_of):
                if base.startswith(aid + "-") and base not in taken:
                    taken.add(base)
                    nxt = nxt or parent_of.get(base)
            aid = nxt
        try:
            lines = check_against(nar, resolvable, judged, "the running Liquid", parent_classes)
        except Unreadable as exc:
            sys.stdout.write("REFUSED %s\n" % nar)
            sys.stdout.write("  %s\n" % exc)
            sys.stdout.write("  %s\n" % NEXT_STEP)
            return 1
        if lines:
            sys.stdout.write("REFUSED %s\n" % nar)
            for line in lines:
                sys.stdout.write(line + "\n")
            sys.stdout.write("  %s\n" % NEXT_STEP)
            return 1
        return 0
    if mode == "check":
        if len(argv) != 3:
            sys.stderr.write("usage: narcheck.py check <nar> <lib-dir>\n")
            return 2
        nar, lib_dir = argv[1], argv[2]
        try:
            lines = check(nar, lib_dir)
        except Unreadable as exc:
            sys.stdout.write("REFUSED %s\n" % nar)
            sys.stdout.write("  %s\n" % exc)
            sys.stdout.write(
                "  A class this bundle carries could not be read, so nothing here can tell a sound\n"
                "  bundle from a broken one. Silence is not consent: it is not deployed.\n"
            )
            sys.stdout.write("  %s\n" % NEXT_STEP)
            return 1
        if not lines:
            return 0
        sys.stdout.write("REFUSED %s\n" % nar)
        for line in lines:
            sys.stdout.write(line + "\n")
        sys.stdout.write("  %s\n" % NEXT_STEP)
        return 1
    sys.stderr.write("unknown mode: %s\n" % mode)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
