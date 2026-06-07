"""Build compact web subsets derived from Nowar Rounded.

Profiles:
- sc: Simplified Chinese dedicated subset, based on GB2312 + zh-CN text.
- common: zh-CN + ja-JP common subset, based on GB2312 + JIS X 0208.

Modified fonts are renamed to avoid Nowar Rounded's OFL reserved names.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import unicodedata
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

try:
    import py7zr
except ImportError:
    py7zr = None

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "fonts"
CACHE_DIR = ROOT / "node_modules" / ".cache" / "moenotes-nowar"
RELEASE_API_URL = "https://api.github.com/repos/nowar-fonts/Nowar-Rounded/releases/latest"
USER_AGENT = "Moenotes-FontSubset/1.0"
DEFAULT_WEIGHTS = (400, 700)

BASE_RANGES = [
    (0x0020, 0x007E),
    (0x00A0, 0x024F),
    (0x0300, 0x036F),
    (0x0370, 0x03FF),
    (0x0400, 0x052F),
    (0x2000, 0x206F),
    (0x2070, 0x209F),
    (0x20A0, 0x20CF),
    (0x2100, 0x214F),
    (0x2150, 0x218F),
    (0x2190, 0x21FF),
    (0x2200, 0x22FF),
    (0x2460, 0x24FF),
    (0x2500, 0x257F),
    (0x25A0, 0x25FF),
    (0x2600, 0x27BF),
    (0x3000, 0x303F),
    (0xFE10, 0xFE1F),
    (0xFE30, 0xFE4F),
    (0xFE50, 0xFE6F),
    (0xFF00, 0xFFEF),
]

KANA_RANGES = [
    (0x3040, 0x309F),
    (0x30A0, 0x30FF),
    (0x31F0, 0x31FF),
    (0x3200, 0x32FF),
    (0x3300, 0x33FF),
]

REPORT_BLOCKS = [
    (0x0020, 0x007E, "Basic Latin"),
    (0x00A0, 0x024F, "Latin"),
    (0x0370, 0x03FF, "Greek"),
    (0x0400, 0x052F, "Cyrillic"),
    (0x2000, 0x206F, "General Punctuation"),
    (0x3000, 0x303F, "CJK Symbols/Punctuation"),
    (0x3040, 0x309F, "Hiragana"),
    (0x30A0, 0x30FF, "Katakana"),
    (0x31F0, 0x31FF, "Katakana Extensions"),
    (0x3400, 0x4DBF, "CJK Ext A"),
    (0x4E00, 0x9FFF, "CJK Unified"),
    (0xAC00, 0xD7AF, "Hangul Syllables"),
    (0xFF00, 0xFFEF, "Half/Fullwidth"),
]

TEXT_SUFFIXES = {".astro", ".css", ".html", ".js", ".jsx", ".json", ".mjs", ".svg", ".ts", ".tsx", ".txt"}
EXCLUDED_DIRS = {".astro", ".git", ".miaomiaomiao", ".plan", "dist", "node_modules"}


@dataclass(frozen=True)
class Profile:
    key: str
    family: str
    output: str
    include_gb2312: bool
    include_jis: bool
    text_files: tuple[Path, ...]
    safelist: Path | None


PROFILES = {
    "sc": Profile(
        key="sc",
        family="Moenotes Rounded SC",
        output="MoenotesRoundedSC",
        include_gb2312=True,
        include_jis=False,
        text_files=(
            ROOT / "src" / "i18n" / "messages" / "zh-CN.ts",
            ROOT / "src" / "config" / "locales.ts",
            ROOT / "src" / "config" / "site.ts",
        ),
        safelist=ROOT / "scripts" / "font-subset-safelist-sc.txt",
    ),
    "common": Profile(
        key="common",
        family="Moenotes Rounded",
        output="MoenotesRounded",
        include_gb2312=True,
        include_jis=True,
        text_files=(),
        safelist=ROOT / "scripts" / "font-subset-safelist.txt",
    ),
}


def request_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode("utf-8"))


def download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req) as response, dest.open("wb") as file:
        total = int(response.headers.get("Content-Length", 0))
        downloaded = 0
        while True:
            chunk = response.read(1024 * 256)
            if not chunk:
                break
            file.write(chunk)
            downloaded += len(chunk)
            if total:
                pct = downloaded * 100 // total
                print(f"  {downloaded / 1024 / 1024:.1f} MiB / {total / 1024 / 1024:.1f} MiB ({pct}%)", end="\r")
        if total:
            print()


def font_cmap(font: TTFont) -> set[int]:
    cmap: set[int] = set()
    for table in font["cmap"].tables:
        cmap.update(table.cmap.keys())
    return cmap


def latest_asset(weight: int) -> tuple[str, str]:
    pattern = re.compile(rf"^NowarRounded-Bliz-{weight}-[0-9.]+\.7z$")
    data = request_json(RELEASE_API_URL)
    for asset in data.get("assets", []):
        name = asset.get("name", "")
        if pattern.match(name):
            return name, asset["browser_download_url"]
    raise RuntimeError(f"Could not find NowarRounded Bliz {weight} release asset")


def score_font(path: Path) -> tuple[int, int]:
    preferred = 1 if path.name.upper() == "2002.TTF" else 0
    try:
        font = TTFont(path)
        cmap = font_cmap(font)
        cjk_count = sum(1 for cp in cmap if 0x4E00 <= cp <= 0x9FFF)
    except Exception:
        cjk_count = 0
    return preferred, cjk_count


def extract_source(archive_path: Path, extract_dir: Path) -> Path:
    if py7zr is None:
        raise RuntimeError("py7zr is required to extract Nowar release archives")
    extract_dir.mkdir(parents=True, exist_ok=True)
    with py7zr.SevenZipFile(archive_path, mode="r") as archive:
        archive.extractall(path=extract_dir)
    candidates = [p for p in extract_dir.rglob("*") if p.suffix.lower() in {".ttf", ".otf"}]
    if not candidates:
        raise RuntimeError(f"No font files found in {archive_path}")
    return max(candidates, key=score_font)


def acquire_source(weight: int, no_download: bool) -> Path:
    cached = CACHE_DIR / f"NowarRounded-Bliz-{weight}-source.ttf"
    if cached.exists():
        return cached
    if no_download:
        raise RuntimeError(f"Missing cached source for weight {weight}")
    name, url = latest_asset(weight)
    archive = CACHE_DIR / name
    print(f"Downloading {name}...")
    download_file(url, archive)
    print(f"Extracting {name}...")
    source = extract_source(archive, CACHE_DIR / f"extract-{weight}")
    cached.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, cached)
    return cached


def chars_from_encoding(encoding: str) -> set[str]:
    chars: set[str] = set()
    for lead in range(0xA1, 0xFF):
        for trail in range(0xA1, 0xFF):
            try:
                text = bytes((lead, trail)).decode(encoding)
            except UnicodeDecodeError:
                continue
            if len(text) == 1 and not unicodedata.category(text).startswith("C"):
                chars.add(text)
    return chars


def assigned_range(start: int, end: int) -> Iterable[int]:
    for cp in range(start, end + 1):
        if not unicodedata.category(chr(cp)).startswith("C"):
            yield cp


def text_codepoints(text: str) -> set[int]:
    return {ord(ch) for ch in text if ord(ch) <= 0xFFFF and not unicodedata.category(ch).startswith("C")}


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="ignore")


def iter_project_text_files() -> Iterable[Path]:
    for root in (ROOT / "src", ROOT / "public"):
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            rel_parts = set(path.relative_to(ROOT).parts)
            if rel_parts & EXCLUDED_DIRS:
                continue
            if "fonts" in rel_parts and path.suffix.lower() not in {".txt"}:
                continue
            yield path
    for path in (ROOT / "package.json", ROOT / "astro.config.mjs", ROOT / "tsconfig.json"):
        if path.exists():
            yield path


def strip_comments(text: str) -> str:
    return "\n".join(line.split("#", 1)[0] for line in text.splitlines())


def profile_coverage(profile: Profile) -> tuple[set[int], set[int], dict[str, int]]:
    optional: set[int] = set()
    required: set[int] = set()
    for start, end in BASE_RANGES:
        optional.update(assigned_range(start, end))
    if profile.include_jis:
        for start, end in KANA_RANGES:
            optional.update(assigned_range(start, end))

    stats: dict[str, int] = {}
    if profile.include_gb2312:
        gb = chars_from_encoding("gb2312")
        required.update(ord(ch) for ch in gb)
        stats["GB2312"] = len(gb)
    if profile.include_jis:
        jis = chars_from_encoding("euc_jp")
        required.update(ord(ch) for ch in jis)
        stats["JIS X 0208"] = len(jis)

    if profile.text_files:
        files = [path for path in profile.text_files if path.exists()]
    else:
        files = list(iter_project_text_files())
    text_points = set()
    for path in files:
        text_points.update(text_codepoints(read_text(path)))
    required.update(text_points)
    stats["Text"] = len(text_points)

    if profile.safelist and profile.safelist.exists():
        safelist_points = text_codepoints(strip_comments(read_text(profile.safelist)))
        required.update(safelist_points)
        stats["Safelist"] = len(safelist_points)
    else:
        stats["Safelist"] = 0

    return required | optional, required, stats


def set_name(record, value: str) -> None:
    try:
        encoding = record.getEncoding()
    except Exception:
        encoding = "utf-16-be"
    record.string = value.encode(encoding, errors="replace")


def rename_font(font: TTFont, profile: Profile, weight: int) -> None:
    subfamily = "Bold" if weight >= 700 else "Regular"
    full_name = f"{profile.family} {subfamily}"
    postscript = f"{profile.output}-{subfamily}"
    values = {
        1: profile.family,
        2: subfamily,
        3: f"Moenotes {profile.output} {subfamily} web subset",
        4: full_name,
        6: postscript,
        16: profile.family,
        17: subfamily,
    }
    name_table = font["name"]
    seen = {record.nameID for record in name_table.names}
    for record in name_table.names:
        if record.nameID in values:
            set_name(record, values[record.nameID])
    for name_id, value in values.items():
        if name_id not in seen:
            name_table.setName(value, name_id, 3, 1, 0x409)
    if "OS/2" in font:
        font["OS/2"].usWeightClass = weight


def subset_font(source: Path, profile: Profile, weight: int, strict: bool) -> None:
    requested, required, stats = profile_coverage(profile)
    font = TTFont(source)
    source_cmap = font_cmap(font)
    missing_required = sorted(required - source_cmap)
    missing_optional = sorted((requested - required) - source_cmap)

    out_path = OUT_DIR / f"{profile.output}-{weight}.woff2"
    print(f"\n[{profile.key}] {source.name} -> {out_path.name}")
    print("  " + ", ".join(f"{key}: {value:,}" for key, value in stats.items()))
    if missing_required:
        preview = ", ".join(f"U+{cp:04X} {chr(cp)!r}" for cp in missing_required[:24])
        message = f"  Source font lacks {len(missing_required)} required codepoints: {preview}"
        if strict:
            raise RuntimeError(message)
        print(message)
    if missing_optional:
        print(f"  Skipped {len(missing_optional)} unsupported optional range codepoints")

    options = Options()
    options.flavor = "woff2"
    options.hinting = False
    options.glyph_names = False
    options.legacy_cmap = False
    options.symbol_cmap = False
    options.notdef_outline = False
    options.recommended_glyphs = False
    options.layout_features = ["kern", "liga", "ccmp", "locl", "vert", "vrt2"]
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 16, 17]
    options.name_languages = [0x0409]
    options.drop_tables += ["BASE", "JSTF", "DSIG"]

    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=sorted(requested & source_cmap))
    subsetter.subset(font)
    rename_font(font, profile, weight)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(out_path)

    out_font = TTFont(out_path)
    cmap = font_cmap(out_font)
    print(f"  Codepoints: {len(cmap):,}")
    print(f"  Glyphs: {len(out_font.getGlyphOrder()):,}")
    print(f"  Size: {out_path.stat().st_size / 1024 / 1024:.2f} MiB")


def inspect_font(path: Path) -> None:
    font = TTFont(path)
    cmap = font_cmap(font)
    names = {record.nameID: record.toUnicode() for record in font["name"].names if record.nameID in {1, 4, 6}}
    print(path.relative_to(ROOT))
    print(f"  Size: {path.stat().st_size / 1024 / 1024:.2f} MiB")
    print(f"  Glyphs: {len(font.getGlyphOrder()):,}")
    print(f"  Unicode codepoints: {len(cmap):,}")
    print(f"  Names: {names}")
    for start, end, label in REPORT_BLOCKS:
        count = sum(1 for cp in cmap if start <= cp <= end)
        if count:
            print(f"  {label}: {count:,}")


def inspect_outputs() -> None:
    for path in sorted(OUT_DIR.glob("MoenotesRounded*.woff2")):
        inspect_font(path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Nowar-derived Moenotes web font subsets.")
    parser.add_argument("--inspect", action="store_true")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--no-download", action="store_true")
    parser.add_argument("--weights", nargs="+", type=int, default=list(DEFAULT_WEIGHTS))
    parser.add_argument("--profiles", nargs="+", choices=sorted(PROFILES), default=["sc", "common"])
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.inspect:
        inspect_outputs()
        return
    for weight in args.weights:
        source = acquire_source(weight, args.no_download)
        for profile_key in args.profiles:
            subset_font(source, PROFILES[profile_key], weight, args.strict)
    print("\nFinal output:")
    inspect_outputs()


if __name__ == "__main__":
    main()
