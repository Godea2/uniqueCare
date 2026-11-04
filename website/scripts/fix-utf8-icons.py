from pathlib import Path

root = Path(__file__).resolve().parents[1]
repl = {
    0x97: "\u2013",
    0x96: "\u2013",
    0xb7: "\u00b7",
    0x91: "'",
    0x92: "'",
    0x93: '"',
    0x94: '"',
    0x85: "\u2026",
}

for q in root.rglob("*"):
    if q.suffix.lower() not in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".md", ".json"}:
        continue
    if "node_modules" in q.parts or ".next" in q.parts or "scripts" in q.parts:
        continue
    data = q.read_bytes()
    changed = False
    try:
        s = data.decode("utf-8")
    except UnicodeDecodeError:
        fixed = bytearray()
        for b in data:
            if b in repl:
                fixed.extend(repl[b].encode("utf-8"))
            elif b < 128:
                fixed.append(b)
            else:
                fixed.extend(b"-")
        s = bytes(fixed).decode("utf-8")
        changed = True
        print("re-encoded", q.relative_to(root))
    if "uc-icon-3d" in s:
        s = s.replace("uc-icon-3d", "uc-icon")
        changed = True
        print("renamed icon class in", q.relative_to(root))
    if changed:
        q.write_bytes(s.encode("utf-8"))

print("scan complete")
