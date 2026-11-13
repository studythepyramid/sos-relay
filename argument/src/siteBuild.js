import { spawn } from 'node:child_process';
import { repoRoot } from './settings.js';

// One MkDocs build at a time; requests that arrive during a build share one
// follow-up build. scripts/build-site.sh also takes a lock against the deploy hook.
export function siteBuilder({ command = 'bash', args = ['scripts/build-site.sh'], cwd = repoRoot, log = console } = {}) {
  let running = false, again = false;
  function run() {
    running = true; again = false;
    let done = false, errors = '';
    const finish = failure => {
      if (done) return;
      done = true; running = false;
      if (failure) log.error('site build failed:', failure);
      if (again) run();
    };
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4000); });
    child.on('error', error => finish(error.message));
    child.on('close', code => finish(code === 0 ? null : `exit ${code}: ${errors.trim()}`));
  }
  return () => { if (running) again = true; else run(); };
}
