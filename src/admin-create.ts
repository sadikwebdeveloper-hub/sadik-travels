import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createStore } from './store.js';
import { hashPassword, normalizeIdentity } from './security.js';

const rl = createInterface({ input, output });
async function secretQuestion(prompt: string) {
  if (!input.isTTY || !input.setRawMode) return rl.question(prompt);
  output.write(prompt); input.setRawMode(true); input.resume(); input.setEncoding('utf8');
  return new Promise<string>((resolve, reject) => {
    let value = '';
    const onData = (chunk: string) => { for (const char of chunk) { if (char === '\u0003') { input.setRawMode?.(false); input.off('data', onData); reject(new Error('Cancelled')); return; } if (char === '\r' || char === '\n') { input.setRawMode?.(false); input.off('data', onData); output.write('\n'); resolve(value); return; } if (char === '\u007f') value = value.slice(0, -1); else value += char; } };
    input.on('data', onData);
  });
}
try {
  const email = (await rl.question('Super admin email: ')).trim();
  const password = await secretQuestion('Super admin password: ');
  const { identity, channel } = normalizeIdentity(email);
  if (channel !== 'email') throw new Error('Super admin bootstrap requires an email address');
  const store = createStore().store;
  let user = await store.findUserByIdentity(identity);
  if (!user) user = await store.createUser({ identity, channel, role: 'super_admin' });
  else await store.setUserRole(user.id, 'super_admin');
  await store.setPasswordHash(user.id, await hashPassword(password));
  console.log(`Super admin ready: ${identity}`);
  store.close();
} finally { rl.close(); }
