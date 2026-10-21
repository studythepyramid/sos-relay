"""Exercise the real hook with temporary Git repos and stubbed deployment commands."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

HOOK = Path(__file__).resolve().parents[1] / 'post-receive'


class DeploymentTests(unittest.TestCase):
    def cmd(self, *args, cwd=None):
        return subprocess.check_output(args, cwd=cwd, text=True, stderr=subprocess.PIPE).strip()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source, self.bare, self.tree = [self.root / name for name in ('source', 'repo.git', 'tree')]
        self.source.mkdir()
        self.cmd('git', 'init', '-b', 'main', cwd=self.source)
        self.cmd('git', 'config', 'user.name', 'Deployment fixture', cwd=self.source)
        self.cmd('git', 'config', 'user.email', 'fixture@example.invalid', cwd=self.source)
        self.cmd('git', 'init', '--bare', str(self.bare))
        self.log = self.root / 'commands.log'
        fixtures = {
            'py/belt_road/crawl.py': 'initial\n',
            'docs/index.md': 'initial\n',
            'argument/src/server.js': 'initial\n',
            'argument/settings.toml': 'initial\n',
            'argument/package.json': '{}\n',
            'argument/package-lock.json': '{}\n',
            'pyproject.toml': '[project]\n',
            'uv.lock': 'version = 1\n',
            'scripts/build-site.sh': '#!/bin/bash\necho site >> "$DEPLOY_TEST_LOG"\nmkdir -p site\necho built > site/index.html\n',
            'scripts/fetch-tts-assets.sh': '#!/bin/bash\necho tts >> "$DEPLOY_TEST_LOG"\nmkdir -p docs/assets/tts/vits-piper-en_US-amy-low-int8\n',
            'deploy/post-receive': HOOK.read_text(),
        }
        self.initial = self.commit(fixtures)
        self.tree.mkdir()
        self.cmd('git', f'--git-dir={self.bare}', f'--work-tree={self.tree}', 'read-tree', '--reset', '-u', self.initial)
        (self.bare / 'sos-deployed-revision').write_text(self.initial + '\n')
        for name in ('argument/node_modules', 'site', 'docs/assets/tts/vits-piper-en_US-amy-low-int8', '.venv/bin'):
            (self.tree / name).mkdir(parents=True, exist_ok=True)
        (self.tree / 'site/index.html').write_text('existing site')
        (self.tree / '.venv/bin/python').symlink_to('/usr/bin/python3')
        tools = self.root / 'bin'
        tools.mkdir()
        for name, command in {
            'uv': 'echo python >> "$DEPLOY_TEST_LOG"',
            'npm': 'echo npm >> "$DEPLOY_TEST_LOG"; if [[ ${FAIL_NPM:-0} == 1 ]]; then exit 17; fi; mkdir -p node_modules',
            'sudo': 'echo restart >> "$DEPLOY_TEST_LOG"',
        }.items():
            path = tools / name
            path.write_text('#!/bin/bash\nset -e\n' + command + '\n')
            path.chmod(0o755)
        self.env = {**os.environ, 'GIT_DIR': str(self.bare),
                    'SOS_DEPLOY_WORKTREE': str(self.tree), 'SOS_DEPLOY_UV': str(tools / 'uv'),
                    'DEPLOY_TEST_LOG': str(self.log), 'PATH': str(tools) + ':' + os.environ['PATH']}
        # Ignore any outer Git worktree/index context when testing isolated repositories.
        for key in ('GIT_WORK_TREE', 'GIT_INDEX_FILE'):
            self.env.pop(key, None)

    def commit(self, changes):
        for name, content in changes.items():
            path = self.source / name
            if content is None:
                path.unlink()
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
        self.cmd('git', 'add', '-A', cwd=self.source)
        self.cmd('git', 'commit', '-m', 'Fixture update', cwd=self.source)
        revision = self.cmd('git', 'rev-parse', 'HEAD', cwd=self.source)
        self.cmd('git', f'--git-dir={self.bare}', 'fetch', str(self.source), 'main:refs/heads/main')
        return revision

    def deploy(self, revision, *, fail=False, ref='refs/heads/main', full=False):
        return subprocess.run(['bash', str(HOOK), *(['--full'] if full else [])],
                              input=f'{self.initial} {revision} {ref}\n', text=True,
                              cwd=self.bare, env={**self.env, 'FAIL_NPM': '1' if fail else '0'},
                              capture_output=True)

    def commands(self):
        return self.log.read_text().splitlines() if self.log.exists() else []

    def test_crawler_only_updates_code_without_build_install_or_restart(self):
        revision = self.commit({'py/belt_road/crawl.py': 'new crawler\n'})
        runtime = self.tree / 'var/runtime.db'
        runtime.parent.mkdir()
        runtime.write_bytes(b'unchanged runtime fixture')
        result = self.deploy(revision)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.commands(), [])
        self.assertEqual((self.tree / 'py/belt_road/crawl.py').read_text(), 'new crawler\n')
        self.assertEqual(runtime.read_bytes(), b'unchanged runtime fixture')
        self.assertEqual((self.tree / 'site/index.html').read_text(), 'existing site')

    def test_site_change_with_spaces_builds_only_site(self):
        revision = self.commit({'docs/a page.md': 'A page\n'})
        self.assertEqual(self.deploy(revision).returncode, 0)
        self.assertEqual(self.commands(), ['site'])

    def test_backend_deletion_restarts_only_backend(self):
        revision = self.commit({'argument/src/server.js': None})
        self.assertEqual(self.deploy(revision).returncode, 0)
        self.assertEqual(self.commands(), ['restart'])
        self.assertFalse((self.tree / 'argument/src/server.js').exists())

    def test_python_dependencies_only_sync_python(self):
        revision = self.commit({'uv.lock': 'version = 2\n'})
        self.assertEqual(self.deploy(revision).returncode, 0)
        self.assertEqual(self.commands(), ['python'])

    def test_failed_deploy_does_not_hide_required_work_on_next_push(self):
        revision = self.commit({'argument/package-lock.json': '{"changed":true}\n'})
        self.assertNotEqual(self.deploy(revision, fail=True).returncode, 0)
        self.assertEqual((self.bare / 'sos-deployed-revision').read_text().strip(), self.initial)
        next_revision = self.commit({'py/belt_road/crawl.py': 'next update\n'})
        self.assertEqual(self.deploy(next_revision).returncode, 0)
        self.assertEqual(self.commands(), ['npm', 'npm', 'restart'])
        self.assertEqual((self.bare / 'sos-deployed-revision').read_text().strip(), next_revision)

    def test_non_main_push_does_nothing(self):
        revision = self.commit({'docs/index.md': 'not deployed\n'})
        self.assertEqual(self.deploy(revision, ref='refs/heads/feature').returncode, 0)
        self.assertEqual(self.commands(), [])
        self.assertEqual((self.tree / 'docs/index.md').read_text(), 'initial\n')

    def test_full_rebuild_is_available(self):
        self.assertEqual(self.deploy(self.initial, full=True).returncode, 0)
        self.assertEqual(self.commands(), ['python', 'tts', 'site', 'npm', 'restart'])

    def test_superseded_push_skips_then_latest_deploys_all_pending_changes(self):
        old_target = self.commit({'docs/index.md': 'new page\n'})
        latest = self.commit({'argument/src/server.js': 'new backend\n'})
        self.assertEqual(self.deploy(old_target).returncode, 0)
        self.assertEqual(self.commands(), [])
        self.assertEqual(self.deploy(latest).returncode, 0)
        self.assertEqual(self.commands(), ['site', 'restart'])

    def test_missing_site_is_recovered_on_crawler_only_push(self):
        (self.tree / 'site/index.html').unlink()
        revision = self.commit({'py/belt_road/crawl.py': 'new crawler\n'})
        self.assertEqual(self.deploy(revision).returncode, 0)
        self.assertEqual(self.commands(), ['site'])

    def test_tts_script_update_fetches_assets_and_rebuilds_only_site(self):
        script = (self.source / 'scripts/fetch-tts-assets.sh').read_text()
        revision = self.commit({'scripts/fetch-tts-assets.sh': script + '# updated\n'})
        self.assertEqual(self.deploy(revision).returncode, 0)
        self.assertEqual(self.commands(), ['tts', 'site'])


if __name__ == '__main__':
    unittest.main()
