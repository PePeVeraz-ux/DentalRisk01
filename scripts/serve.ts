import { spawn } from 'node:child_process';
const commands = [
  ['--import', 'tsx', 'apps/api/src/server.ts'],
  [
    'node_modules/next/dist/bin/next',
    'start',
    'apps/web',
    '--hostname',
    '0.0.0.0',
    '--port',
    '3000',
  ],
];
const children = commands.map((args) =>
  spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true }),
);
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill('SIGTERM'));
  process.exitCode = code;
}
children.forEach((child) => {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 1));
});
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
