const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function fixture(t, user = 'yuxuanServer') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventclub-ssh-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'ssh.json');
  // Emulate transport and sudo locally; never connect to a host or change uid.
  fs.writeFileSync(path.join(dir, 'ssh'), `#!/bin/bash
"$TEST_NODE" -e 'require("fs").writeFileSync(process.env.TEST_LOG, JSON.stringify(process.argv.slice(1)))' -- "$@"
for command in "$@"; do :; done
exec /bin/bash -c "$command"
`, { mode: 0o700 });
  const init = path.join(dir, 'shell-init');
  fs.writeFileSync(init, `
cd() { if [[ "$1" == /home/eventadmin ]]; then return 0; fi; builtin cd "$@"; }
sudo() {
  [[ "$1 $2 $3 $4 $5" == '-n -H -u eventadmin --' ]] || return 81
  [[ "\u0024{TEST_DENY_SUDO:-}" != 1 ]] || return 77
  shift 5
  "$@"
}
export -f cd sudo
`);
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, SERVER_USER: user,
    SSH_KEY: '/synthetic/key with spaces', SSH_AGENT_SOCKET: '/synthetic/agent socket',
    BASH_ENV: init, TEST_NODE: process.execPath, TEST_LOG: log,
    TEST_LIB: path.join(__dirname, 'server-lib.sh') };
  return {
    run(script, input, args = [], extra = {}) {
      return spawnSync('/bin/bash', ['-c', 'source "$TEST_LIB"; ' + script, 'test', ...args], { env: { ...env, ...extra }, input });
    },
    cli(mode, extra = {}) {
      const script = fs.existsSync(path.join(__dirname, 'deploy-frontend.sh')) ? 'deploy-frontend.sh' : 'deploy-server.sh';
      return spawnSync('/bin/bash', [path.join(__dirname, script), mode], { env: { ...env, ...extra } });
    },
    args: () => fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : null,
  };
}

for (const user of ['eventadmin', 'yuxuanServer']) {
  test(`${user}: binary stdin survives SSH and account switching`, t => {
    const f = fixture(t, user);
    const payload = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 256));
    const r = f.run('remote cat', payload);
    assert.equal(r.status, 0, r.stderr.toString());
    assert.deepEqual(r.stdout, payload);
    const args = f.args();
    assert.ok(args.includes(`${user}@59.110.51.187`));
    assert.ok(args.includes('/synthetic/key with spaces'));
    assert.ok(args.includes('IdentityAgent=/synthetic/agent socket'));
    assert.equal(args.at(-1).startsWith('sudo '), user !== 'eventadmin');
  });
}

test('stdin scripts preserve literal arguments and application HOME/PM2_HOME', t => {
  const f = fixture(t);
  const args = ["single'quote", 'two words', '$(printf INJECTED)', 'line\nbreak', ''];
  const r = f.run('remote_bash "$@"', 'printf "%s\\0" "$HOME" "$PM2_HOME" "$@"\n', args);
  assert.equal(r.status, 0, r.stderr.toString());
  assert.deepEqual(r.stdout, Buffer.from(['/home/eventadmin', '/home/eventadmin/.pm2', ...args, ''].join('\0')));
});

test('failed remote commands stop before later commands', t => {
  const r = fixture(t).run("remote 'false; printf unexpected'");
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout.length, 0);
});

test('invalid SSH usernames are rejected before connecting', t => {
  const f = fixture(t, 'user; touch /tmp/invalid');
  assert.notEqual(f.run('remote true').status, 0);
  assert.equal(f.args(), null);
});

test('plan is offline and check propagates a denied sudo without publishing', t => {
  const f = fixture(t);
  const plan = f.cli('--plan');
  assert.equal(plan.status, 0, plan.stderr.toString());
  assert.equal(f.args(), null);
  const check = f.cli('--check', { TEST_DENY_SUDO: '1' });
  assert.equal(check.status, 77, check.stderr.toString());
  assert.ok(f.args().at(-1).startsWith('sudo -n -H -u eventadmin -- '));
});
