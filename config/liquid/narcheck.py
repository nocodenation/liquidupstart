#!/usr/bin/env python3
import io
import os
import struct
import sys
import zipfile

NIFI_PREFIX = "org/apache/nifi/"
BUNDLED_DIRS = ("NAR-INF/bundled-dependencies/", "META-INF/bundled-dependencies/")

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
    return found


def _open_zip(data, where):
    try:
        return zipfile.ZipFile(io.BytesIO(data))
    except (zipfile.BadZipFile, OSError) as exc:
        raise Unreadable("%s: could not be opened as an archive (%s)" % (where, exc))


def _read(zf, name, where):
    try:
        return zf.read(name)
    except (zipfile.BadZipFile, OSError, RuntimeError) as exc:
        raise Unreadable("%s: could not be read out of the archive (%s)" % (where, exc))


def _class_names(zf):
    return set(n[:-6] for n in zf.namelist() if n.endswith(".class"))


def _bundled_jars(zf):
    return [n for n in zf.namelist() if n.endswith(".jar") and n.startswith(BUNDLED_DIRS)]


def bundle_classes(path):
    """Every class the NAR carries, as {name: (data, where)}, its own and its bundled jars'."""
    with open(path, "rb") as fh:
        data = fh.read()
    carried = {}
    root = _open_zip(data, os.path.basename(path))
    for name in sorted(zf_names(root)):
        carried[name[:-6]] = (_read(root, name, "%s!%s" % (os.path.basename(path), name)),
                              "%s!%s" % (os.path.basename(path), name))
    for jar in sorted(_bundled_jars(root)):
        where = "%s!%s" % (os.path.basename(path), jar)
        inner = _open_zip(_read(root, jar, where), where)
        for name in sorted(zf_names(inner)):
            carried[name[:-6]] = (_read(inner, name, "%s!%s" % (where, name)),
                                  "%s!%s" % (where, name))
    return carried


def zf_names(zf):
    return [n for n in zf.namelist() if n.endswith(".class")]


def lib_jars(lib_dir):
    if not os.path.isdir(lib_dir):
        return []
    return sorted(os.path.join(lib_dir, n) for n in os.listdir(lib_dir) if n.endswith(".jar"))


def jar_class_names(path):
    try:
        with zipfile.ZipFile(path) as zf:
            return _class_names(zf)
    except (zipfile.BadZipFile, OSError):
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


def check(nar, lib_dir):
    """Returns a list of refusal lines. Empty means the bundle may be copied."""
    carried = bundle_classes(nar)
    resolvable = set(carried)
    for jar in lib_jars(lib_dir):
        resolvable |= jar_class_names(jar)
    judged = provided_packages(lib_dir)
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
            % (owner.replace("/", "."), ref.replace("/", "."), lib_dir)
        )
    return lines


NEXT_STEP = (
    "Rebuild it against the API this Liquid loads and drop it in again. "
    "`nar-build --target` prints that version."
)


def main(argv):
    if len(argv) < 2:
        sys.stderr.write("usage: narcheck.py refs <class-file> | narcheck.py check <nar> <lib-dir>\n")
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
