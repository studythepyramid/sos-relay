"""Rebuild the HTML of notes written by argument/src/notes.js from an allow-list.

Those pages carry `sos_user_note: true` front matter. The notes service already
refuses raw HTML, character references, and script links in Markdown notes; this
hook is the second wall, applied to what Python-Markdown actually produced.
MkDocs renders theme templates without autoescaping, so the service also keeps
`<`, `>`, `&`, and `"` out of note titles.
"""
from html import escape
from html.parser import HTMLParser
import re

ATTRIBUTES = {
    **{tag: () for tag in (
        "p", "br", "hr", "em", "strong", "code", "pre", "blockquote", "ul", "li",
        "del", "sup", "sub", "table", "thead", "tbody", "tr", "span", "summary",
    )},
    "div": ("style",),
    **{f"h{level}": ("id",) for level in range(1, 7)},
    "ol": ("start",),
    "a": ("href", "title"),
    "img": ("src", "alt", "title"),
    "th": ("style",),
    "td": ("style",),
    "details": ("open",),
}
VOID = {"br", "hr", "img"}
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "noscript", "template", "textarea", "svg", "math", "title"}
STYLES = {"text-align: left;", "text-align: center;", "text-align: right;", "white-space: pre-wrap"}
URL_SCHEMES = {"a": {"http", "https", "mailto"}, "img": {"http", "https"}}


def safe_url(tag, value):
    # Browsers ignore ASCII whitespace and control characters inside a scheme.
    compact = re.sub(r"[\x00-\x20]+", "", value)
    scheme = re.match(r"([A-Za-z][A-Za-z0-9+.-]*):", compact)
    return scheme is None or scheme.group(1).lower() in URL_SCHEMES[tag]


class Sanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.dropping = 0

    def handle_starttag(self, tag, attrs):
        if tag in DROP_WITH_CONTENT:
            self.dropping += tag not in VOID
            return
        if self.dropping or tag not in ATTRIBUTES:
            return
        kept = []
        for name, value in attrs:
            value = value or ""
            if name == "class" and re.fullmatch(r"[\w -]*", value):
                kept.append((name, value))
            elif name in ATTRIBUTES[tag]:
                if name == "style" and value.strip() not in STYLES:
                    continue
                if name in ("href", "src") and not safe_url(tag, value):
                    continue
                kept.append((name, value))
        self.out.append("<" + tag + "".join(f' {n}="{escape(v)}"' for n, v in kept) + ">")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in DROP_WITH_CONTENT:
            self.dropping = max(0, self.dropping - 1)
        elif not self.dropping and tag in ATTRIBUTES and tag not in VOID:
            self.out.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.dropping:
            self.out.append(escape(data, quote=False))


def sanitize(html):
    parser = Sanitizer()
    parser.feed(html)
    parser.close()
    return "".join(parser.out)


def on_page_content(html, page, config, files):
    if page.meta.get("sos_user_note") is True:
        return sanitize(html)
    return html
