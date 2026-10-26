import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('door_speak', Path(__file__).parents[1] / 'speak.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


class SpeakTests(unittest.TestCase):
    def test_speech_text_drops_markdown(self):
        self.assertEqual(s.speech_text('## Purpose and `start`'), 'Purpose and start')
        self.assertEqual(s.speech_text('Read [the notes](../doors.md)\nnow.'), 'Read the notes now.')
        self.assertEqual(s.speech_text('> Read it.\n> Then act.'), 'Read it. Then act.')

    def test_opening_blocks_follow_page_order(self):
        source = ('<!-- door:nav -->\n[English](readme.md)\n<!-- /door:nav -->\n\n'
                  '# Door\n\nPrepared today.\n\n## Purpose\n\nOne.\n\nTwo.\n\nThree.\n')
        self.assertEqual(s.opening_blocks(source, 5),
                         ['Door', 'Prepared today.', 'Purpose', 'One.', 'Two.'])

    def test_opening_blocks_stop_before_code(self):
        source = '# Door\n\nIntro.\n\n```bash\nls\n```\n\nAfter.\n'
        self.assertEqual(s.opening_blocks(source, 5), ['Door', 'Intro.'])


if __name__ == '__main__':
    unittest.main()
