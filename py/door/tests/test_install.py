import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('door_install', Path(__file__).parents[1] / 'install.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class InstallTests(unittest.TestCase):
    def test_stale_source_and_edited_output_are_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            build, target = root/'build', root/'target'
            target.mkdir()
            (target/'readme.md').write_text('Original')
            for name in p.FILES:
                file = build/'public'/name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text('Generated '+name)
            (build/'source.sha256').write_text('wrong')
            with self.assertRaises(ValueError):
                p.install(build, target, root/'backups', root/'state.json')
            self.assertFalse((target/'readme.ru.md').exists())
            (build/'source.sha256').write_text(p.checksum(target/'readme.md'))
            p.install(build, target, root/'backups', root/'state.json')
            backups = list((root/'backups').glob('*/readme.md'))
            self.assertEqual(backups[0].read_text(), 'Original')
            (target/'readme.ru.md').write_text('Human correction')
            (build/'source.sha256').write_text(p.checksum(target/'readme.md'))
            with self.assertRaises(ValueError):
                p.install(build, target, root/'backups', root/'state.json')
            self.assertEqual((target/'readme.ru.md').read_text(), 'Human correction')
