import importlib.util
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('door_publish', Path(__file__).parents[1] / 'publish.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class PublicationTests(unittest.TestCase):
    def test_code_and_reference_definitions_never_sent_to_model(self):
        source = '# Title\n\n```bash\nrm example\n\necho keep\n```\n\nText [link][ref-1].\n\n[ref-1]:\n  https://example.com/\n'
        chunks = p.blocks(source)
        protected = [text for active, text in chunks if not active]
        self.assertEqual(protected, ['```bash\nrm example\n\necho keep\n```', '[ref-1]:\n  https://example.com/'])

    def test_literal_validation_and_restoration(self):
        original = 'Use `curl -I` and [source][ref-1].'
        masked, literals = p.protect(original)
        translated = masked.replace('Use', 'Используйте').replace('and', 'и')
        p.validate(masked, translated)
        self.assertIn('`curl -I`', p.restore(translated, literals))
        self.assertIn('[source][ref-1]', p.restore(translated, literals))
        with self.assertRaises(ValueError):
            p.validate(masked, translated.replace('ZXKEEP0XZ', 'curl'))

    def test_cross_language_contamination_is_rejected(self):
        with self.assertRaises(ValueError):
            p.validate('Audience: agents', 'Аудитория: 其他代理', 'ru')
        with self.assertRaises(ValueError):
            p.validate('Audience: agents', 'کاربران Привет', 'fa')
        p.validate('Use Qwen', 'Используйте Qwen', 'ru')
        with self.assertRaises(ValueError):
            p.validate('Hello', 'Keep ZXKEEP<number>XZ unchanged', 'ru')

    def test_output_navigation_rtl_and_relative_links(self):
        with tempfile.TemporaryDirectory() as temporary:
            args = SimpleNamespace(output=Path(temporary))
            source = '# Door\n\n[Other](../doors.md)\n'
            p.export(source, {'ru': source, 'fa': source, 'zh': source}, args)
            public = args.output / 'public'
            for lang in p.LANGUAGES:
                file = public / ('index.html' if lang == 'en' else f'{lang}/index.html')
                page = file.read_text()
                self.assertEqual(page.count('<nav aria-label="Languages">'), 3)
                self.assertNotIn('{{', page)
            persian = (public / 'fa/index.html').read_text()
            self.assertIn('lang="fa" dir="rtl"', persian)
            self.assertIn('href="../../doors.md"', persian)
            self.assertIn('href="../readme.md"', persian)
            original = (public / 'readme.md').read_text()
            self.assertEqual(p.NAV.sub('', original).strip(), source.strip())

    def test_cache_preserves_reviewed_translation(self):
        with tempfile.TemporaryDirectory() as temporary:
            args = SimpleNamespace(output=Path(temporary), state=Path(temporary)/'state.json',
                                   model='qwen2.5:latest', base_url='unused', timeout=1)
            source = '# Hello'
            state = {'model_digest': 'test', 'pieces': {}}
            key = p.digest(p.json.dumps([p.VERSION, 'test', 'ru', source]))
            state['pieces'][key] = {'translation': '# Привет', 'reviewed': True}
            translator = SimpleNamespace(translate_blocks=lambda *a, **k: self.fail('Cache should avoid model call'))
            self.assertEqual(p.translate(source, 'ru', translator, args, state), '# Привет\n')

    def test_chinese_page_places_english_then_chinese(self):
        with tempfile.TemporaryDirectory() as temporary:
            args = SimpleNamespace(output=Path(temporary), state=Path(temporary)/'state.json',
                                   model='qwen2.5:latest', base_url='unused', timeout=1)
            source = '# Door\n\nHelp the user.\n'
            state = {'model_digest': 'test', 'pieces': {}}
            for text, zh in (('# Door', '# 门'), ('Help the user.', '帮助用户。')):
                key = p.digest(p.json.dumps([p.VERSION, 'test', 'zh', text]))
                state['pieces'][key] = {'translation': zh, 'reviewed': True}
            translator = SimpleNamespace(translate_blocks=lambda *a, **k: self.fail('Cache should avoid model call'))
            out = p.translate(source, 'zh', translator, args, state)
            self.assertIn('# Door\n\n# 门\n\nHelp the user.\n\n帮助用户。', out)
            changed_key = p.digest(p.json.dumps([p.VERSION, 'test', 'ru', '# Changed']))
            self.assertNotEqual(key, changed_key)


if __name__ == '__main__':
    unittest.main()
