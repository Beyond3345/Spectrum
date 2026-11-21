#!/usr/bin/env node
// A stand-in for /usr/bin/security that answers as it does, for SPECTRUM_SECURITY: never this Mac's keychain. Its items
// are kept in the file SPECTRUM_FAKE_KEYCHAIN names, every command line in that file's .argv beside it.
// add-generic-password -U -s -a -X (hex), read from standard input after -i; find-generic-password -s -a -w.
import fs from 'node:fs';

const file = process.env.SPECTRUM_FAKE_KEYCHAIN;
if (!file) process.exit(3);
const args = process.argv.slice(2);
fs.appendFileSync(file + '.argv', JSON.stringify(args) + '\n');
// a file .locked beside it answers as a keychain that will not open
if (fs.existsSync(file + '.locked')) {
  console.error('security: SecKeychainItemCopyContent: User interaction is not allowed.');
  process.exit(36);
}
const items = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const opt = (a, flag) => a[a.indexOf(flag) + 1];
if (args[0] === '-i') {
  for (const line of fs.readFileSync(0, 'utf8').split('\n').filter(Boolean)) {
    const a = line.trim().split(/\s+/);
    if (a[0] !== 'add-generic-password' || !a.includes('-U')) process.exit(1);
    items[opt(a, '-s') + '/' + opt(a, '-a')] = Buffer.from(opt(a, '-X'), 'hex').toString('utf8');
  }
  fs.writeFileSync(file, JSON.stringify(items));
} else if (args[0] === 'find-generic-password' && args.includes('-w')) {
  const value = items[opt(args, '-s') + '/' + opt(args, '-a')];
  if (value === undefined) {
    console.error('security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.');
    process.exit(44);
  }
  process.stdout.write(value + '\n');
} else process.exit(2);
