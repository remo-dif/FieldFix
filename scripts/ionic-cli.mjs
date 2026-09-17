import { spawn } from 'node:child_process';

// Ionic CLI 7 forwards --project=app; Angular 22 expects the actual project name as a positional argument.
const [mode, ...ionicArgs] = process.argv.slice(2);
if (mode !== 'build' && mode !== 'serve') throw new Error('Unsupported Ionic mode');
const args = ionicArgs.filter(arg => !arg.startsWith('--project='));

function run(script, scriptArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Process exited with code ${code}`)));
  });
}

await run('node_modules/@angular/cli/bin/ng.js', [mode, 'fieldfix', ...args]);
if (mode === 'build') await run('scripts/build-service-worker.mjs', []);
