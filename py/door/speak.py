"""Pre-render the opening Door blocks with local Piper voices.

Writes one mp3 per voice, a manifest of start/end seconds per block, and a
voices.json index. Nothing here runs on the VPS or in the browser.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

VMODELS = Path.home() / 'dev/media-scripts/vmodels'
VOICES = {
    'us-lessac': ('US English · Lessac', VMODELS / 'en_US-lessac-medium.onnx'),
    'gb-northern-male': ('UK English · Northern male', VMODELS / 'en_GB-northern_english_male-medium.onnx'),
}
GAP_SECONDS = 0.4

_spec = importlib.util.spec_from_file_location('door_publish', Path(__file__).with_name('publish.py'))
publish = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(publish)


def speech_text(block):
    text = re.sub(r'^#{1,6}\s*', '', block.strip())
    text = re.sub(r'^>\s?', '', text, flags=re.M)
    text = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'\[([^\]]+)\]\[[^\]]*\]', r'\1', text)
    text = text.replace('`', '')
    text = re.sub(r'[*_]{1,2}([^*_]+)[*_]{1,2}', r'\1', text)
    return ' '.join(text.split())


def opening_blocks(source, count):
    """First `count` blocks in page order; stops at code or references so
    segment i stays the i-th child of the rendered <article>."""
    selected = []
    for active, block in publish.blocks(publish.NAV.sub('', source).strip() + '\n'):
        if not active or len(selected) == count:
            break
        if re.match(r'(?:- |\d+\. )', block):
            break
        text = speech_text(block)
        if text:
            selected.append(text)
    return selected


def synthesize(model, text, out):
    subprocess.run(['piper', '-m', str(model), '--output_file', str(out)],
                   input=text.encode(), check=True, capture_output=True)


def render_voice(voice_id, label, model, texts, out_dir):
    voice_dir = out_dir / voice_id
    voice_dir.mkdir(parents=True, exist_ok=True)
    segments = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        frames = bytearray()
        params = None
        for index, text in enumerate(texts):
            clip = tmp / f'{index}.wav'
            synthesize(model, text, clip)
            with wave.open(str(clip)) as w:
                if params is None:
                    params = w.getparams()
                rate = w.getframerate()
                width = w.getsampwidth() * w.getnchannels()
                if index:
                    frames += b'\0' * int(GAP_SECONDS * rate) * width
                start = len(frames) / width / rate
                frames += w.readframes(w.getnframes())
                end = len(frames) / width / rate
            segments.append({'index': index, 'text': text,
                             'start': round(start, 3), 'end': round(end, 3)})
        joined = tmp / 'readme.wav'
        with wave.open(str(joined), 'wb') as w:
            w.setparams(params)
            w.writeframes(bytes(frames))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(joined),
                        '-ac', '1', '-b:a', '64k', str(voice_dir / 'readme.mp3')], check=True)
    manifest = {'voice': voice_id, 'label': label, 'audio': 'readme.mp3', 'segments': segments}
    (voice_dir / 'readme.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    return {'id': voice_id, 'label': label, 'manifest': f'{voice_id}/readme.json'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/my/md/door/readme.md'))
    parser.add_argument('--output', type=Path, default=Path('tmp/door-tts'))
    parser.add_argument('--blocks', type=int, default=5)
    parser.add_argument('--voices', nargs='+', choices=sorted(VOICES), default=list(VOICES))
    args = parser.parse_args()
    if not shutil.which('piper') or not shutil.which('ffmpeg'):
        raise SystemExit('piper and ffmpeg must be on PATH')
    texts = opening_blocks(args.source.read_text(), args.blocks)
    args.output.mkdir(parents=True, exist_ok=True)
    index = []
    for voice_id in args.voices:
        label, model = VOICES[voice_id]
        index.append(render_voice(voice_id, label, model, texts, args.output))
        print(f'{voice_id}: {len(texts)} blocks')
    (args.output / 'voices.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
