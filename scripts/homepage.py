"""Use za's root-level draft as the homepage without changing docs/index.md."""
from pathlib import Path
import re


def on_files(files, config):
    source = Path(config.config_file_path).parent / "za-index.md"
    homepage = files.get_file_from_path("index.md")
    if homepage is None:
        raise RuntimeError("The homepage requires an index.md entry in docs_dir")
    homepage.content_string = source.read_text(encoding="utf-8")
    return files


def on_page_markdown(markdown, page, config, files):
    """Link existing history translations without editing authored source files."""
    path = Path(page.file.src_uri)
    if path.parent.as_posix() != "history_notes":
        return markdown

    if path.name == "index.md":
        def add_translation(match):
            target = Path(match.group(1))
            if target.stem.endswith("-en"):
                return match.group(0)
            translated = target.with_name(target.stem + "-en.md")
            if files.get_file_from_path("history_notes/" + translated.as_posix()):
                return match.group(0) + f" / [Chinese + English]({translated.as_posix()})"
            return match.group(0)

        return re.sub(r"\[[^\]\n]+\]\(([^()\s]+\.md)\)", add_translation, markdown)

    bilingual = path.stem.endswith("-en")
    other = path.with_name(path.stem[:-3] + ".md" if bilingual else path.stem + "-en.md")
    if not files.get_file_from_path(other.as_posix()):
        return markdown
    languages = (
        f"[中文原文]({other.name}) · **中文 + English**"
        if bilingual else f"**中文原文** · [中文 + English]({other.name})"
    )
    return f"{languages} · [History index / 历史目录](index.md)\n\n---\n\n{markdown}"
