"""Translate the Door runbook locally, then export Markdown and static HTML."""
from __future__ import annotations

import argparse
import hashlib
import html
import importlib
import importlib.util
import json
import re
import sys
import textwrap
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import markdown

LANGUAGES = {'en': 'English', 'ru': 'Русский', 'fa': 'فارسی', 'zh': '简体中文'}
NAMES = {'en': 'English', 'ru': 'Russian', 'fa': 'Persian (Iranian Farsi)', 'zh': 'Simplified Chinese'}
NOTICE = {
    'en': 'English source · Local-first networking notes',
    'ru': 'Машинный перевод · Перевод не проверен человеком',
    'fa': 'ترجمه و بازبینی با هوش مصنوعی · هنوز توسط انسان بازبینی نشده است',
    'zh': '机器翻译 · 尚未经人工审校',
}
CLOSE = {'en': 'Close language selector', 'ru': 'Закрыть выбор языка',
         'fa': 'بستن انتخاب زبان', 'zh': '关闭语言选择器'}
VERSION = 'door-v1'
TOKEN = re.compile(r'ZXKEEP\d+XZ')
NAV = re.compile(r'<!-- door:nav -->.*?<!-- /door:nav -->\s*', re.S)
INLINE = re.compile(r'`[^`\n]+`|\[ref-\d+\]|https?://[^\s<>]+')


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def atomic(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.next')
    temporary.write_text(text, encoding='utf-8')
    temporary.replace(path)


def load_translator(root):
    """Import the existing implementation under a distinct package name."""
    spec = importlib.util.spec_from_file_location(
        'door_localllm', root / 'py/__init__.py',
        submodule_search_locations=[str(root / 'py')])
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    translator = importlib.import_module('door_localllm.translate')
    rule = ('\nKeep every ZXKEEP<number>XZ token exactly once, unchanged. '
            'These tokens represent literal technical content. '
            'Preserve heading levels, list markers and blockquotes. '
            'Write only in the requested target language. Keep product names in English.\n')
    translator.TRANSLATE_PROMPT = translator.TRANSLATE_PROMPT.replace('--- SOURCE ---', rule + '\n--- SOURCE ---')
    translator.TRANSLATE_BLOCKS_PROMPT = translator.TRANSLATE_BLOCKS_PROMPT.replace('Blocks:\n', rule + '\nBlocks:\n')
    translator.ollama_generate = generate
    return translator


def generate(model, prompt, *, base_url, timeout, json_format=False):
    """Ollama options missing from localllm's minimal client, same API."""
    body = {'model': model, 'prompt': prompt, 'stream': False,
            'system': 'You are a careful professional translator. Return only the requested translation.',
            'options': {'temperature': 0.1, 'num_ctx': 8192, 'num_predict': 3000}}
    if json_format:
        body['format'] = 'json'
    request = urllib.request.Request(base_url.rstrip('/') + '/api/generate',
                data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        result = json.load(response)
    if not result.get('done') or result.get('done_reason') == 'length':
        raise ValueError('Incomplete model response; translation was not saved')
    return result.get('response', '').strip()


def blocks(source):
    """Keep fences and reference definitions out of the model entirely."""
    result = []
    for part in re.split(r'(^```[^\n]*\n.*?^```\s*$)', source, flags=re.M | re.S):
        if not part.strip():
            continue
        if part.startswith('```'):
            result.append((False, part.strip()))
            continue
        for paragraph in re.split(r'\n\s*\n', part.strip()):
            if not paragraph.strip():
                continue
            if paragraph.startswith('[ref-'):
                result.append((False, paragraph))
            else:
                # Each list item is independently tracked and validated.
                items = re.split(r'\n(?=(?:- |\d+\. ))', paragraph)
                result.extend((True, item) for item in items if item.strip())
    return result


def protect(text):
    literals = []
    def substitute(match):
        literals.append(match.group())
        return f'ZXKEEP{len(literals)-1}XZ'
    return INLINE.sub(substitute, text), literals


def validate(source, candidate, language=None):
    prose = TOKEN.sub("", candidate)
    if language in ("ru", "fa") and re.search(r"[\u3400-\u9fff]", prose):
        raise ValueError("Unexpected Chinese text in translation")
    if language == "ru" and re.search(r"[\u0600-\u06ff]", prose):
        raise ValueError("Unexpected Arabic/Persian text in Russian")
    if language in ("fa", "zh") and re.search(r"[\u0400-\u04ff]", prose):
        raise ValueError("Unexpected Cyrillic text in translation")
    if "ZXKEEP" in TOKEN.sub("", candidate):
        raise ValueError("Leaked preservation instruction")
    if not candidate.strip() or 'translation text for block' in candidate.lower():
        raise ValueError('Empty translation or leaked prompt placeholder')
    if sorted(TOKEN.findall(source)) != sorted(TOKEN.findall(candidate)):
        raise ValueError('Changed protected code/link tokens')
    if re.findall(r'^#{1,6} ', source, re.M) != re.findall(r'^#{1,6} ', candidate, re.M):
        raise ValueError('Changed heading hierarchy')
    for pattern in (r'^#{1,6} ', r'^> ', r'^(?:- |\d+\. )'):
        if re.findall(pattern, source, re.M) and not re.findall(pattern, candidate, re.M):
            raise ValueError('Lost Markdown structure')
    if len(candidate) > max(200, len(source) * 5):
        raise ValueError('Implausibly expanded translation')


def wrap(text):
    out = []
    for line in text.splitlines():
        match = re.match(r'^(#{1,6} |> |(?:- |\d+\. ))', line)
        prefix = match.group() if match else ''
        continuation = '> ' if prefix == '> ' else ' ' * len(prefix)
        out.extend(textwrap.wrap(line[len(prefix):], 72,
                   initial_indent=prefix, subsequent_indent=continuation,
                   break_long_words=False, break_on_hyphens=False) or [''])
    return '\n'.join(out)


def translate(source, language, translator, args, state):
    pieces = blocks(source)
    pending = []
    results = {}
    cfg = {'languages': {name: code for code, name in NAMES.items()}}
    for i, (translatable, text) in enumerate(pieces):
        if not translatable:
            results[i] = text
            continue
        masked, literals = protect(text)
        key = digest(json.dumps([VERSION, state['model_digest'], language, text]))
        record = state['pieces'].get(key)
        if record:
            try:
                validate(masked, record['translation'], language)
            except ValueError:
                record = None
        if record:
            results[i] = restore(record['translation'], literals)
        else:
            pending.append((i, key, masked, literals, text))
    source_headings = {line.strip() for line in source.splitlines() if line.startswith('#')}
    total = len(pending)
    print(f'{language}: {total} blocks remaining', flush=True)
    while pending:
        batch = []
        length = 0
        while pending and (not batch or length + len(pending[0][2]) < 1800):
            item = pending.pop(0)
            batch.append(item)
            length += len(item[2])
        if language == 'fa':
            translations = [translator.translate_text(
                b[2], src_code='en', tgt_code=NAMES[language],
                model=args.model, base_url=args.base_url, timeout=args.timeout, cfg=cfg)
                for b in batch]
        else:
            translations = translator.translate_blocks(
                [b[2] for b in batch], src_code='en', tgt_code=NAMES[language],
                model=args.model, base_url=args.base_url, timeout=args.timeout, cfg=cfg)
        for item, candidate in zip(batch, translations, strict=True):
            i, key, masked, literals, original = item
            if not original.startswith('#'):
                candidate = '\n'.join(line for line in candidate.splitlines() if line.strip() not in source_headings).strip()
            for attempt in range(3):
                try:
                    validate(masked, candidate, language)
                    break
                except ValueError:
                    if attempt == 2:
                        print(f'Failed block {i}: {original!r} => {candidate!r}', flush=True)
                        raise
                    foreign = r"[\u3400-\u9fff]+" if language in ('ru', 'fa') else r"[\u0400-\u04ff]+"
                    if re.search(foreign, candidate):
                        def repair(match):
                            return translator.translate_text(
                                match[0], src_code='auto', tgt_code=NAMES[language],
                                model=args.model, base_url=args.base_url,
                                timeout=args.timeout, cfg=cfg)
                        candidate = re.sub(foreign, repair, candidate)
                    else:
                        candidate = translate_fragments(masked, language, translator, args, cfg)
            state['pieces'][key] = {'source': original, 'translation': candidate,
                                    'language': language, 'reviewed': False}
            results[i] = restore(candidate, literals)
            atomic(args.state, json.dumps(state, ensure_ascii=False, indent=2))
        print(f'{language}: {total-len(pending)}/{total} translated', flush=True)
    if language == 'zh':
        # English source, then Chinese, one block at a time. Code fences stay once.
        # The English edition itself is unchanged.
        mixed = []
        for i, (translatable, text) in enumerate(pieces):
            if translatable:
                mixed.append(text.strip())
            mixed.append(results[i].strip())
        draft = '\n\n'.join(mixed) + '\n'
    else:
        draft = '\n\n'.join(results[i] for i in range(len(pieces))) + '\n'
    review = '\n\n---\n\n'.join(
        text + '\n\n' + results[i] for i, (translatable, text) in enumerate(pieces)
        if translatable)
    atomic(args.output / 'review' / f'{language}.md', review + '\n')
    return draft


def translate_fragments(masked, language, translator, args, cfg):
    """Fallback: keep syntax outside the model and translate prose spans."""
    fragments = re.split(r'(ZXKEEP\d+XZ)', masked)
    output = []
    for fragment in fragments:
        if TOKEN.fullmatch(fragment) or not re.search(r'[A-Za-z]', fragment):
            output.append(fragment)
            continue
        match = re.match(r'^(#{1,6} |> |(?:- |\d+\. ))', fragment)
        prefix = match[0] if match else ''
        prose = fragment[len(prefix):]
        translated = translator.translate_text(
            prose.strip(), src_code='en', tgt_code=NAMES[language],
            model=args.model, base_url=args.base_url, timeout=args.timeout, cfg=cfg)
        leading = ' ' if prose.startswith(' ') else ''
        trailing = ' ' if prose.endswith(' ') else ''
        output.append(prefix + leading + translated + trailing)
    return ''.join(output)


def restore(candidate, literals):
    for i, literal in enumerate(literals):
        candidate = candidate.replace(f'ZXKEEP{i}XZ', literal)
    return wrap(candidate)


def md_nav(language):
    links = []
    for code, label in LANGUAGES.items():
        file = 'readme.md' if code == 'en' else f'readme.{code}.md'
        links.append(f'[{label}]({file})')
    return '<!-- door:nav -->\n' + '\n'.join(links) + '\n<!-- /door:nav -->'


def nav_html(language):
    prefix = '' if language == 'en' else '../'
    links = []
    for code, label in LANGUAGES.items():
        path = 'index.html' if code == 'en' else f'{code}/index.html'
        active = ' aria-current="page"' if code == language else ''
        lang = 'zh-CN' if code == 'zh' else code
        links.append(f'<a href="{prefix}{path}" lang="{lang}"{active}>{label}</a>')
    return '<nav aria-label="Languages">' + ''.join(links) + '</nav>'


def export(source, translations, args):
    public = args.output / 'public'
    template_dir = Path(__file__).parent / 'templates'
    template = (template_dir / 'page.html').read_text()
    for name in ('door.css', 'door.js'):
        atomic(public / name, (template_dir / name).read_text())
    pending = {
        'ru': '# Перевод пока не готов\n\nПожалуйста, прочитайте английский оригинал.',
        'fa': '# ترجمهٔ فارسی هنوز آماده نیست\n\nلطفاً نسخهٔ انگلیسی را بخوانید. پیش‌نویس فارسی نیاز به اصلاح دارد.',
        'zh': '# 翻译尚未完成\n\n请先阅读英文原文。',
    }
    for language, content in {'en': source, **pending, **translations}.items():
        status = 'pending' if language != 'en' and language not in translations else 'draft' if language != 'en' else 'source'
        file = 'readme.md' if language == 'en' else f'readme.{language}.md'
        nav = md_nav(language)
        notice = '' if language == 'en' else f'{NOTICE[language]}\n\n[English source](readme.md)\n\n'
        atomic(public / file, nav + '\n\n' + notice + content.strip() + '\n\n' + nav + '\n')
        rendered = markdown.markdown(content, extensions=['fenced_code', 'tables'])
        if language != 'en':
            rendered = re.sub(r'href="(?![a-zA-Z]+:|/|#)([^"]+)"',
                              lambda m: 'href="../' + m[1] + '"', rendered)
        prefix = '' if language == 'en' else '../'
        title_match = re.search(r'^# (.+)', content, re.M)
        title = title_match[1] if title_match else 'Door'
        values = {'LANG': 'zh-CN' if language == 'zh' else language,
                  'DIR': 'rtl' if language == 'fa' else 'ltr',
                  'TITLE': html.escape(title), 'PREFIX': prefix,
                  'NAV': nav_html(language), 'BODY': rendered,
                  'NOTICE': html.escape(NOTICE[language] if status != 'pending' else 'Translation pending review · English source available'),
                  'CLOSE': CLOSE[language], 'FILE': file,
                  'DATE': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                  'STATUS': status}
        page = template
        for key, value in values.items():
            page = page.replace('{{' + key + '}}', value)
        path = public / ('index.html' if language == 'en' else f'{language}/index.html')
        atomic(path, page)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/my/md/door/readme.md'))
    parser.add_argument('--localllm', type=Path, default=Path.home() / 'dev/localllm')
    parser.add_argument('--output', type=Path, default=Path('tmp/door'))
    parser.add_argument('--state', type=Path, default=Path('tmp/door-state.json'))
    parser.add_argument('--model', default='qwen2.5:latest')
    parser.add_argument('--base-url', default='http://127.0.0.1:11434')
    parser.add_argument('--timeout', type=int, default=300)
    parser.add_argument('--languages', nargs='+', choices=['ru', 'fa', 'zh'], default=['ru', 'fa', 'zh'])
    parser.add_argument('--offline', action='store_true', help='Rebuild only from cached translations')
    args = parser.parse_args()
    source = NAV.sub('', args.source.read_text()).strip() + '\n'
    state = json.loads(args.state.read_text()) if args.state.exists() else {'pieces': {}}
    if not args.offline:
        with urllib.request.urlopen(args.base_url + '/api/tags', timeout=10) as response:
            models = json.load(response)['models']
        model = next(m for m in models if m['name'] == args.model)
        if model['details'].get('parameter_size') != '7.6B':
            raise ValueError('This runbook requires the selected Qwen 7B model')
        state['model_digest'] = model['digest']
    elif 'model_digest' not in state:
        raise ValueError('No existing model cache; run translation first')
    translator = load_translator(args.localllm)
    if args.offline:
        def missing(*a, **kw):
            raise ValueError('Translation cache is incomplete or source has changed')
        translator.translate_blocks = missing
        translator.translate_text = missing
    state['source_hash'] = digest(source)
    translations = {lang: translate(source, lang, translator, args, state)
                    for lang in args.languages}
    export(source, translations, args)
    atomic(args.output / 'source.sha256', digest(args.source.read_text()) + '\n')
    print(f'Built {args.output / "public"}; no deployment performed.', flush=True)


if __name__ == '__main__':
    main()
