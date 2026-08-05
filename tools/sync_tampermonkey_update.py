from __future__ import annotations

import os
import re
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path

REPO = os.environ.get("GITHUB_REPOSITORY", "XXX2024XXX/tampermonkey-scripts")
BEFORE = os.environ.get("GITHUB_BEFORE", "")
SHA = os.environ.get("GITHUB_SHA", "HEAD")
MARKER = "<!-- AUTO-CHANGELOG: 自動更新はこの行の下へ追加されます -->"
VERSION_RE = re.compile(r"^(\s*//\s*@version\s+)([^\s]+)(.*)$", re.MULTILINE)


def run(*args: str, check: bool = True) -> str:
    result = subprocess.run(args, check=check, text=True, capture_output=True)
    return result.stdout.strip()


def changed_userscripts() -> list[str]:
    if BEFORE and set(BEFORE) != {"0"}:
        output = run("git", "diff", "--name-only", BEFORE, SHA)
    else:
        output = run("git", "show", "--pretty=", "--name-only", SHA)

    files = []
    for line in output.splitlines():
        line = line.strip()
        if line.startswith("scripts/") and line.endswith(".user.js") and Path(line).is_file():
            files.append(line)
    return list(dict.fromkeys(files))


def read_text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8-sig")


def write_bom(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8-sig")


def version_from_text(text: str) -> str | None:
    match = VERSION_RE.search(text)
    return match.group(2) if match else None


def previous_text(path: str) -> str:
    if not BEFORE or set(BEFORE) == {"0"}:
        return ""
    result = subprocess.run(
        ["git", "show", f"{BEFORE}:{path}"],
        text=True,
        capture_output=True,
    )
    return result.stdout if result.returncode == 0 else ""


def increment_version(version: str) -> str:
    parts = version.split(".")
    for index in range(len(parts) - 1, -1, -1):
        if parts[index].isdigit():
            parts[index] = str(int(parts[index]) + 1)
            return ".".join(parts)
    return version + ".1"


def ensure_version_bumped(path: str) -> tuple[str, str]:
    current = read_text(path)
    current_version = version_from_text(current)
    if not current_version:
        raise RuntimeError(f"@version が見つかりません: {path}")

    old = previous_text(path)
    old_version = version_from_text(old) if old else None

    if old_version and current_version == old_version:
        new_version = increment_version(current_version)
        current = VERSION_RE.sub(
            lambda m: f"{m.group(1)}{new_version}{m.group(3)}",
            current,
            count=1,
        )
        write_bom(path, current)
        current_version = new_version

    return old_version or "新規", current_version


def update_current_url(path: str) -> None:
    raw_url = f"https://raw.githubusercontent.com/{REPO}/main/{path}\n"
    write_bom("tools/tampermonkey-current-url.txt", raw_url)


def update_changelog(changes: list[tuple[str, str, str]]) -> None:
    changelog_path = Path("CHANGELOG.md")
    text = changelog_path.read_text(encoding="utf-8-sig")
    if MARKER not in text:
        raise RuntimeError("CHANGELOG.md の自動更新マーカーが見つかりません。")

    jst = timezone(timedelta(hours=9))
    stamp = datetime.now(jst).strftime("%Y-%m-%d %H:%M JST")
    lines = [f"\n## {stamp}"]
    for path, old_version, new_version in changes:
        lines.append(f"- `{path}`: `{old_version}` → `{new_version}`")
    block = "\n".join(lines) + "\n"
    text = text.replace(MARKER, MARKER + block, 1)
    write_bom(str(changelog_path), text)


def main() -> None:
    files = changed_userscripts()
    if not files:
        print("変更された .user.js はありません。")
        return

    changes: list[tuple[str, str, str]] = []
    for path in files:
        old_version, new_version = ensure_version_bumped(path)
        changes.append((path, old_version, new_version))

    # v8が1件のURLを読むため、最後に変更されたスクリプトを対象にする。
    update_current_url(files[-1])
    update_changelog(changes)

    print("自動同期対象:")
    for path, old_version, new_version in changes:
        print(f"- {path}: {old_version} -> {new_version}")
    print(f"Tampermonkey対象URL: {files[-1]}")


if __name__ == "__main__":
    main()
