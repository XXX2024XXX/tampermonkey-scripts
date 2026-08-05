from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

REPO = "XXX2024XXX/tampermonkey-scripts"
BRANCH = "main"
CHANGELOG_MARKER = "<!-- AUTO-CHANGELOG: 自動更新はこの行の下へ追加されます -->"


def bump_version(version: str) -> str:
    parts = version.strip().split(".")
    if not parts or any(not part.isdigit() for part in parts):
        raise ValueError(f"未対応の @version 形式です: {version}")
    parts[-1] = str(int(parts[-1]) + 1)
    return ".".join(parts)


def raw_url(path: Path) -> str:
    encoded = "/".join(quote(part) for part in path.as_posix().split("/"))
    return f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/{encoded}"


def replace_metadata_line(text: str, key: str, value: str) -> tuple[str, bool]:
    pattern = re.compile(rf"^(\s*//\s*@{re.escape(key)}\s+).*$", re.MULTILINE)
    if pattern.search(text):
        return pattern.sub(lambda match: f"{match.group(1)}{value}", text, count=1), True
    return text, False


def insert_before_header_end(text: str, key: str, value: str) -> str:
    marker = "// ==/UserScript=="
    if marker not in text:
        raise ValueError("UserScriptヘッダーが見つかりません")
    return text.replace(marker, f"// @{key.ljust(12)}{value}\n{marker}", 1)


def update_script(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8-sig")
    if "// ==UserScript==" not in text or "// ==/UserScript==" not in text:
        raise ValueError("UserScriptヘッダーが見つかりません")

    version_match = re.search(r"^\s*//\s*@version\s+([^\s]+)\s*$", text, re.MULTILINE)
    if not version_match:
        raise ValueError("@version が見つかりません")

    old_version = version_match.group(1)
    new_version = bump_version(old_version)
    text, _ = replace_metadata_line(text, "version", new_version)

    url = raw_url(path)
    text, found_update = replace_metadata_line(text, "updateURL", url)
    if not found_update:
        text = insert_before_header_end(text, "updateURL", url)

    text, found_download = replace_metadata_line(text, "downloadURL", url)
    if not found_download:
        text = insert_before_header_end(text, "downloadURL", url)

    path.write_text(text, encoding="utf-8-sig", newline="\n")
    return old_version, new_version


def update_changelog(entries: list[tuple[Path, str, str]]) -> None:
    changelog = Path("CHANGELOG.md")
    text = changelog.read_text(encoding="utf-8-sig") if changelog.exists() else f"# CHANGELOG\n\n{CHANGELOG_MARKER}\n"
    if CHANGELOG_MARKER not in text:
        text = text.rstrip() + f"\n\n{CHANGELOG_MARKER}\n"

    jst = timezone(timedelta(hours=9))
    timestamp = datetime.now(jst).strftime("%Y-%m-%d %H:%M JST")
    lines = [f"\n## {timestamp}"]
    for path, old_version, new_version in entries:
        lines.append(f"- `{path.as_posix()}`: `{old_version}` → `{new_version}`")
    block = "\n".join(lines) + "\n"
    text = text.replace(CHANGELOG_MARKER, CHANGELOG_MARKER + block, 1)
    changelog.write_text(text, encoding="utf-8-sig", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="*", help="更新対象の .user.js ファイル")
    args = parser.parse_args()

    targets = [Path(value) for value in args.files]
    if not targets:
        targets = sorted(Path("scripts").rglob("*.user.js"))

    targets = [path for path in targets if path.is_file() and path.suffixes[-2:] == [".user", ".js"]]
    if not targets:
        print("更新対象の .user.js はありません。")
        return 0

    entries: list[tuple[Path, str, str]] = []
    for path in targets:
        try:
            old_version, new_version = update_script(path)
            entries.append((path, old_version, new_version))
            print(f"更新: {path} {old_version} -> {new_version}")
        except Exception as exc:
            print(f"エラー: {path}: {exc}", file=sys.stderr)
            return 1

    update_changelog(entries)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
