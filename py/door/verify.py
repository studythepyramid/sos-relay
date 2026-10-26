"""Check generated Door pages without network access."""
import argparse
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import urlsplit, unquote


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.links = []
        self.assets = []
        self.headings = []
        self.lang = self.direction = self.status = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == 'a' and 'href' in data:
            self.links.append(data['href'])
        if tag == 'link' and data.get('rel') == 'stylesheet':
            self.assets.append(data['href'])
        if tag == 'script' and 'src' in data:
            self.assets.append(data['src'])
        if re.fullmatch('h[1-6]', tag):
            self.headings.append(tag)
        if tag == 'html':
            self.lang, self.direction = data.get('lang'), data.get('dir')
            self.status = data.get('data-translation-status')


def verify(public, source):
    original = source.read_text()
    fences = re.findall(r'^```[^\n]*\n(.*?)^```', original, re.M | re.S)
    pages = {lang: public / ('index.html' if lang == 'en' else f'{lang}/index.html')
             for lang in ('en', 'ru', 'fa', 'zh')}
    parsed = {lang: Page(path.read_text()) for lang, path in pages.items()}
    external = Counter(link for link in parsed['en'].links if urlsplit(link).scheme)
    for lang, path in pages.items():
        text = path.read_text()
        page = parsed[lang]
        assert 'ZXKEEP' not in text and '{{' not in text, (lang, 'leaked placeholder')
        if page.status != 'pending':
            expected_headings = [h for h in parsed['en'].headings for _ in range(2)] if lang == 'zh' else parsed['en'].headings
            assert page.headings == expected_headings, (lang, 'changed headings')
            assert Counter(link for link in page.links if urlsplit(link).scheme) == Counter({link: count * (2 if lang == 'zh' else 1) for link, count in external.items()}), (lang, 'changed external links')
        else:
            print(f'{lang}: explicit pending-translation page, not a completed edition.')
        assert page.lang == ('zh-CN' if lang == 'zh' else lang)
        assert page.direction == ('rtl' if lang == 'fa' else 'ltr')
        for link in page.links + page.assets:
            url = urlsplit(link)
            if url.scheme or not url.path or url.path.startswith('/'):
                continue
            target = (path.parent / unquote(url.path)).resolve()
            # Links leaving the publication tree refer to existing notes.
            if target.is_relative_to(public.resolve()):
                assert target.is_file(), (lang, link, 'missing local file')
            else:
                relative = Path(__import__('os').path.relpath(target, public.resolve()))
                assert (source.parent / relative).is_file(), (lang, link, 'missing source note')
        md = public / ('readme.md' if lang == 'en' else f'readme.{lang}.md')
        translated_fences = re.findall(r'^```[^\n]*\n(.*?)^```', md.read_text(), re.M | re.S)
        if page.status != 'pending':
            assert translated_fences == fences, (lang, 'changed commands')
    print('Verified four language pages: heading structure, links, assets, literal code, languages and RTL.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', type=Path, default=Path('tmp/door/public'))
    parser.add_argument('--source', type=Path, default=Path('/my/md/door/readme.md'))
    args = parser.parse_args()
    verify(args.public, args.source)
