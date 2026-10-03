import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { register } from './auth.js';
import { initialize, closeAll } from './db.js';
import { dbPath } from './settings.js';

async function readPassword() {
  if (!process.stdin.isTTY) {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk.toString();
      if (input.length > 1024) throw new Error('Password input is too long');
    }
    return input.replace(/\r?\n$/, '');
  }
  // readline handles editing; suppress its terminal echo so passwords stay hidden.
  const output = new Writable({ write(chunk, encoding, callback) { callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  rl.on('SIGINT', () => rl.close());
  try {
    process.stderr.write('Password (8–128 characters): ');
    const password = await rl.question('');
    process.stderr.write('\nConfirm password: ');
    const confirmation = await rl.question('');
    if (password !== confirmation) throw new Error('Passwords do not match');
    return password;
  } finally {
    rl.close();
    process.stderr.write('\n');
  }
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('-')) {
    throw new Error('Usage: npm run create-user -- USERNAME (password prompted or read from stdin)');
  }
  const password = await readPassword();
  initialize(dbPath);
  const user = await register(dbPath, args[0], password);
  console.log(`Created account ${user.username} in ${dbPath}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  closeAll();
}
