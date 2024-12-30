'use strict';

const path = require('path');
const assert = require('assert');
const fs = require('mz/fs');
const sleep = require('mz-modules/sleep');
const rimraf = require('mz-modules/rimraf');
const mkdirp = require('mz-modules/mkdirp');
const coffee = require('coffee');
const httpclient = require('urllib');
const mm = require('mm');
const utils = require('./utils');

describe('test/stop.test.js', () => {
  const eggBin = require.resolve('../bin/egg-scripts.js');
  const fixturePath = path.join(__dirname, 'fixtures/example');
  const timeoutPath = path.join(__dirname, 'fixtures/stop-timeout');
  const homePath = path.join(__dirname, 'fixtures/home');
  const logDir = path.join(homePath, 'logs');
  const waitTime = '15s';

  before(async () => {
    await mkdirp(homePath);
  });
  after(async () => {
    await rimraf(homePath);
  });
  beforeEach(() => mm(process.env, 'MOCK_HOME_DIR', homePath));
  afterEach(() => mm.restore);

  describe('stop without daemon', () => {
    let app;
    let killer;

    beforeEach(async () => {
      await utils.cleanup(fixturePath);
      app = coffee.fork(eggBin, [ 'start', '--workers=2', fixturePath ]);
      // app.debug();
      app.expect('code', 0);
      await sleep(waitTime);

      assert.equal(utils.replaceWeakRefMessage(app.stderr), '');
      assert(app.stdout.match(/custom-framework started on http:\/\/127\.0\.0\.1:7001/));
      const result = await httpclient.request('http://127.0.0.1:7001');
      assert(result.data.toString() === 'hi, egg');
    });

    afterEach(async () => {
      app.proc.kill('SIGTERM');
      await utils.cleanup(fixturePath);
    });

    it('should stop', async () => {
      killer = coffee.fork(eggBin, [ 'stop', fixturePath ]);
      killer.debug();
      killer.expect('code', 0);

      // await killer.end();
      await sleep(waitTime);

      // make sure is kill not auto exist
      assert(!app.stdout.includes('exist by env'));

      // no way to handle the SIGTERM signal in windows ?
      if (!isWin) {
        assert(app.stdout.includes('[master] master is killed by signal SIGTERM, closing'));
        assert(app.stdout.includes('[master] exit with code:0'));
        assert(app.stdout.includes('[app_worker] exit with code:0'));
        // assert(app.stdout.includes('[agent_worker] exit with code:0'));
      }

      assert(killer.stdout.includes('[egg-scripts] stopping egg application'));
      assert(killer.stdout.match(/got master pid \["\d+\"\]/i));
    });
  });

  describe('stop with daemon', () => {
    beforeEach(async () => {
      await utils.cleanup(fixturePath);
      await rimraf(logDir);
      await coffee.fork(eggBin, [ 'start', '--daemon', '--workers=2', fixturePath ])
        .debug()
        .expect('code', 0)
        .end();

      const result = await httpclient.request('http://127.0.0.1:7001');
      assert(result.data.toString() === 'hi, egg');
    });
    afterEach(async () => {
      await utils.cleanup(fixturePath);
    });

    it('should stop', async () => {
      await coffee.fork(eggBin, [ 'stop', fixturePath ])
        .debug()
        .expect('stdout', /\[egg-scripts] stopping egg application/)
        .expect('stdout', /got master pid \["\d+\"\]/i)
        .expect('code', 0)
        .end();

      await sleep(waitTime);

      // master log
      const stdout = await fs.readFile(path.join(logDir, 'master-stdout.log'), 'utf-8');

      // no way to handle the SIGTERM signal in windows ?
      if (!isWin) {
        assert(stdout.includes('[master] master is killed by signal SIGTERM, closing'));
        assert(stdout.includes('[master] exit with code:0'));
        assert(stdout.includes('[app_worker] exit with code:0'));
      }

      await coffee.fork(eggBin, [ 'stop', fixturePath ])
        .debug()
        .expect('stderr', /can't detect any running egg process/)
        .expect('code', 0)
        .end();
    });
  });

  describe('stop with not exist', () => {
    it('should work', async () => {
      await utils.cleanup(fixturePath);
      await coffee.fork(eggBin, [ 'stop', fixturePath ])
        .debug()
        .expect('stdout', /\[egg-scripts] stopping egg application/)
        .expect('stderr', /can't detect any running egg process/)
        .expect('code', 0)
        .end();
    });
  });

  describe('stop --title', () => {
    let app;
    let killer;

    beforeEach(async () => {
      await utils.cleanup(fixturePath);
      app = coffee.fork(eggBin, [ 'start', '--workers=2', '--title=example', fixturePath ]);
      // app.debug();
      app.expect('code', 0);
      await sleep(waitTime);

      assert.equal(utils.replaceWeakRefMessage(app.stderr), '');
      assert(app.stdout.match(/custom-framework started on http:\/\/127\.0\.0\.1:7001/));
      const result = await httpclient.request('http://127.0.0.1:7001');
      assert(result.data.toString() === 'hi, egg');
    });

    afterEach(async () => {
      app.proc.kill('SIGTERM');
      await utils.cleanup(fixturePath);
    });

    it('shoud stop only if the title matches exactly', async () => {
      // Because of'exmaple'.inclues('exmap') === true，if egg-scripts <= 2.1.0 and you run `.. stop --title=exmap`，the process with 'title:example' will also be killed unexpectedly
      await coffee.fork(eggBin, [ 'stop', '--title=examp', fixturePath ])
        .debug()
        .expect('stdout', /\[egg-scripts] stopping egg application with --title=examp/)
        .expect('stderr', /can't detect any running egg process/)
        .expect('code', 0)
        .end();

      // stop only if the title matches exactly
      await coffee.fork(eggBin, [ 'stop', '--title=example', fixturePath ])
        .debug()
        .expect('stdout', /\[egg-scripts] stopping egg application with --title=example/)
        .expect('stdout', /\[egg-scripts\] got master pid \[/)
        .expect('code', 0)
        .end();
    });

    it('should stop', async () => {
      await coffee.fork(eggBin, [ 'stop', '--title=random', fixturePath ])
        .debug()
        .expect('stdout', /\[egg-scripts] stopping egg application with --title=random/)
        .expect('stderr', /can't detect any running egg process/)
        .expect('code', 0)
        .end();

      killer = coffee.fork(eggBin, [ 'stop', '--title=example' ], { cwd: fixturePath });
      killer.debug();
      killer.expect('code', 0);

      // await killer.end();
      await sleep(waitTime);

      // make sure is kill not auto exist
      assert(!app.stdout.includes('exist by env'));

      // no way to handle the SIGTERM signal in windows ?
      if (!isWin) {
        assert(app.stdout.includes('[master] master is killed by signal SIGTERM, closing'));
        assert(app.stdout.includes('[master] exit with code:0'));
        assert(app.stdout.includes('[app_worker] exit with code:0'));
        // assert(app.stdout.includes('[agent_worker] exit with code:0'));
      }

      assert(killer.stdout.includes('[egg-scripts] stopping egg application with --title=example'));
      assert(killer.stdout.match(/got master pid \["\d+\"\]/i));
    });
  });

  describe('stop all', () => {
    let app;
    let app2;
    let killer;

    beforeEach(async () => {
      await utils.cleanup(fixturePath);
      app = coffee.fork(eggBin, [ 'start', '--workers=2', '--title=example', fixturePath ]);
      // app.debug();
      app.expect('code', 0);

      app2 = coffee.fork(eggBin, [ 'start', '--workers=2', '--title=test', '--port=7002', fixturePath ]);
      app2.expect('code', 0);

      await sleep(waitTime);

      assert.equal(utils.replaceWeakRefMessage(app.stderr), '');
      assert(app.stdout.match(/custom-framework started on http:\/\/127\.0\.0\.1:7001/));
      const result = await httpclient.request('http://127.0.0.1:7001');
      assert(result.data.toString() === 'hi, egg');

      assert.equal(utils.replaceWeakRefMessage(app2.stderr), '');
      assert(app2.stdout.match(/custom-framework started on http:\/\/127\.0\.0\.1:7002/));
      const result2 = await httpclient.request('http://127.0.0.1:7002');
      assert(result2.data.toString() === 'hi, egg');
    });

    afterEach(async () => {
      app.proc.kill('SIGTERM');
      app2.proc.kill('SIGTERM');
      await utils.cleanup(fixturePath);
    });

    it('should stop', async () => {
      killer = coffee.fork(eggBin, [ 'stop' ], { cwd: fixturePath });
      killer.debug();
      killer.expect('code', 0);

      // await killer.end();
      await sleep(waitTime);

      // make sure is kill not auto exist
      assert(!app.stdout.includes('exist by env'));

      // no way to handle the SIGTERM signal in windows ?
      if (!isWin) {
        assert(app.stdout.includes('[master] master is killed by signal SIGTERM, closing'));
        assert(app.stdout.includes('[master] exit with code:0'));
        assert(app.stdout.includes('[app_worker] exit with code:0'));
        // assert(app.stdout.includes('[agent_worker] exit with code:0'));
      }

      assert(killer.stdout.includes('[egg-scripts] stopping egg application'));
      assert(killer.stdout.match(/got master pid \["\d+\","\d+\"\]/i));

      assert(!app2.stdout.includes('exist by env'));

      // no way to handle the SIGTERM signal in windows ?
      if (!isWin) {
        assert(app2.stdout.includes('[master] master is killed by signal SIGTERM, closing'));
        assert(app2.stdout.includes('[master] exit with code:0'));
        assert(app2.stdout.includes('[app_worker] exit with code:0'));
      }
    });
  });

  describe('stop all with timeout', function() {
    let app;
    let killer;
    this.timeout(17000);
    beforeEach(async () => {
      await utils.cleanup(timeoutPath);
      app = coffee.fork(eggBin, [ 'start', '--workers=2', '--title=stop-timeout', timeoutPath ]);
      app.debug();
      app.expect('code', 0);

      await sleep(waitTime);

      assert.equal(utils.replaceWeakRefMessage(app.stderr), '');
      assert(app.stdout.match(/http:\/\/127\.0\.0\.1:7001/));
      const result = await httpclient.request('http://127.0.0.1:7001');
      assert(result.data.toString() === 'hi, egg');
    });

    afterEach(async () => {
      app.proc.kill('SIGTERM');
      await utils.cleanup(timeoutPath);
    });

    it('should stop error without timeout', async () => {
      killer = coffee.fork(eggBin, [ 'stop' ], { cwd: timeoutPath });
      killer.debug();
      killer.expect('code', 0);

      // await killer.end();
      await sleep(waitTime);

      // make sure is kill not auto exist
      assert(!app.stdout.includes('exist by env'));

      // no way to handle the SIGTERM signal in windows ?
      if (!isWin) {
        assert(app.stdout.includes('[master] master is killed by signal SIGTERM, closing'));
        assert(app.stdout.match(/app_worker#\d+:\d+ disconnect/));
        assert(app.stdout.match(/don't fork, because worker:\d+ will be kill soon/));
      }

      assert(killer.stdout.includes('[egg-scripts] stopping egg application'));
      assert(killer.stdout.match(/got master pid \["\d+\"]/i));
    });

    it('should stop success', async () => {
      killer = coffee.fork(eggBin, [ 'stop', '--timeout=10s' ], { cwd: timeoutPath });
      killer.debug();
      killer.expect('code', 0);

      // await killer.end();
      await sleep(waitTime);

      // make sure is kill not auto exist
      assert(!app.stdout.includes('exist by env'));

      // no way to handle the SIGTERM signal in windows ?
      if (!isWin) {
        assert(app.stdout.includes('[master] master is killed by signal SIGTERM, closing'));
        assert(app.stdout.includes('[master] exit with code:0'));
        assert(app.stdout.includes('[agent_worker] exit with code:0'));
      }

      assert(killer.stdout.includes('[egg-scripts] stopping egg application'));
      assert(killer.stdout.match(/got master pid \["\d+\"]/i));
    });
  });

  describe('stop with symlink', () => {
    const baseDir = path.join(__dirname, 'fixtures/tmp');

    beforeEach(async () => {
      // if we can't create a symlink, skip the test
      try {
        await fs.symlink(fixturePath, baseDir, 'dir');
      } catch (err) {
        // may get Error: EPERM: operation not permitted on windows
        console.log(`test skiped, can't create symlink: ${err}`);
        this.skip();
      }

      // *unix get the real path of symlink, but windows wouldn't
      const appPathInRegexp = isWin ? baseDir.replace(/\\/g, '\\\\') : fixturePath;

      await utils.cleanup(fixturePath);
      await rimraf(logDir);
      await coffee.fork(eggBin, [ 'start', '--daemon', '--workers=2' ], { cwd: baseDir })
        .debug()
        .expect('stdout', new RegExp(`Starting custom-framework application at ${appPathInRegexp}`))
        .expect('code', 0)
        .end();

      await rimraf(baseDir);
      const result = await httpclient.request('http://127.0.0.1:7001');
      assert(result.data.toString() === 'hi, egg');
    });
    afterEach(async () => {
      await utils.cleanup(fixturePath);
      await rimraf(baseDir);
    });

    it('should stop', async () => {
      await rimraf(baseDir);
      await fs.symlink(path.join(__dirname, 'fixtures/status'), baseDir);

      await coffee.fork(eggBin, [ 'stop', baseDir ])
        .debug()
        .expect('stdout', /\[egg-scripts] stopping egg application/)
        .expect('stdout', /got master pid \["\d+\"\]/i)
        .expect('code', 0)
        .end();
    });
  });

});
