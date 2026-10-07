const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

async function run(root, fixture, mode = 'fixed') {
  for (const key of Object.keys(process.env)) {
    if (
      /^(?:https?_proxy|all_proxy|no_proxy|npm_config_(?:https?_proxy|proxy|noproxy))$/i.test(key)
    )
      delete process.env[key];
  }
  assert(!process.env.NODE_TLS_REJECT_UNAUTHORIZED, 'Never disable TLS for fixture controls');
  const network = require(
    path.join(root, 'e2e/node_modules/playwright-core/lib/server/utils/network.js'),
  );
  const servers = [],
    sockets = new Set(),
    allowedPorts = new Set(),
    records = [];
  let originRequests = 0,
    proxyConnections = 0,
    proof;
  const tracked = (server) => {
    servers.push(server);
    server.on(server instanceof https.Server ? 'secureConnection' : 'connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    if (server instanceof https.Server)
      server.on('tlsClientError', (error, socket) => socket.destroy());
    return new Promise((resolve) =>
      server.listen(0, '127.0.0.1', () => {
        allowedPorts.add(server.address().port);
        resolve(server);
      }),
    );
  };
  let badURL, wrongURL;
  const handler = (req, res) => {
    originRequests++;
    if (req.url === '/slow') return;
    if (req.url === '/relative') {
      res.writeHead(302, { location: '/ok' });
      res.end();
      return;
    }
    if (req.url === '/bad-redirect' || req.url === '/wrong-redirect') {
      res.writeHead(302, { location: req.url === '/bad-redirect' ? badURL : wrongURL });
      res.end();
      return;
    }
    if (req.url === '/status') {
      res.writeHead(503);
      res.end('unavailable');
      return;
    }
    if (req.url === '/close') {
      res.writeHead(200, { 'content-length': '1000' });
      res.write('short');
      setImmediate(() => res.destroy());
      return;
    }
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () =>
      res.end(
        JSON.stringify({
          path: req.url,
          method: req.method,
          body,
          marker: req.headers['x-fixture'],
        }),
      ),
    );
  };
  const origin = async (cert) => tracked(https.createServer({ key: fixture.key, cert }, handler));
  const url = (server) => 'https://127.0.0.1:' + server.address().port;
  const good = await origin(fixture.trusted),
    bad = await origin(fixture.untrusted),
    wrong = await origin(fixture.wrong);
  badURL = url(bad) + '/ok';
  wrongURL = url(wrong) + '/ok';
  const proxy = async (cert, reject = false) => {
    const callback = (req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () =>
        res.end(
          JSON.stringify({
            path: req.url,
            method: req.method,
            body,
            marker: req.headers['x-fixture'],
          }),
        ),
      );
    };
    const server = cert
      ? https.createServer({ key: fixture.key, cert, ALPNProtocols: ['http/1.1'] }, callback)
      : http.createServer(callback);
    server.on('connect', (req, client, head) => {
      proxyConnections++;
      if (reject) {
        client.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n');
        return;
      }
      const match = /^127\.0\.0\.1:(\d+)$/.exec(req.url);
      if (!match || !allowedPorts.has(Number(match[1]))) {
        client.destroy();
        return;
      }
      const upstream = net.connect(Number(match[1]), '127.0.0.1');
      sockets.add(upstream);
      upstream.once('close', () => sockets.delete(upstream));
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
      client.once('close', () => upstream.destroy());
    });
    return tracked(server);
  };
  const plainProxy = await proxy(),
    tlsProxy = await proxy(fixture.trusted),
    badProxy = await proxy(fixture.untrusted),
    rejectProxy = await proxy(null, true);
  const routes = {
    direct: '',
    http: 'http://127.0.0.1:' + plainProxy.address().port,
    https: url(tlsProxy),
    badOuter: url(badProxy),
    reject: 'http://127.0.0.1:' + rejectProxy.address().port,
  };
  const request = async (name, target, policy, route, extra = {}) => {
    process.env.HTTPS_PROXY = route;
    process.env.HTTP_PROXY = route;
    process.env.NO_PROXY = '';
    const before = originRequests;
    let cancel;
    const outcome = await new Promise((resolve) => {
      let finished = false;
      const finish = (value) => {
        if (!finished) {
          finished = true;
          clearTimeout(deadline);
          resolve(value);
        }
      };
      const deadline = setTimeout(() => {
        cancel?.(new Error('fixture deadline'));
        finish({ ok: false, error: 'FIXTURE_DEADLINE' });
      }, 3000);
      const params = { url: target, socketTimeout: 1000, ...extra };
      if (policy !== 'omitted') params.rejectUnauthorized = policy;
      cancel = network.httpRequest(
        params,
        (response) => {
          let body = '';
          response.on('data', (chunk) => (body += chunk));
          response.on('error', (error) =>
            finish({ ok: false, error: error.code || error.message }),
          );
          response.on('end', () => finish({ ok: true, status: response.statusCode, body }));
        },
        (error) => finish({ ok: false, error: error.code || error.message, detail: error.message }),
      ).cancel;
      if (extra.cancelFixture) setTimeout(() => cancel(new Error('fixture cancel')), 20);
    });
    records.push({ name, outcome, originRequests: originRequests - before });
    return outcome;
  };
  try {
    for (const [routeName, route] of Object.entries(routes).filter(([name]) =>
      ['direct', 'http', 'https'].includes(name),
    )) {
      for (const [kind, server] of [
        ['trusted', good],
        ['untrusted', bad],
        ['wrong-name', wrong],
      ]) {
        for (const policy of ['omitted', true, false]) {
          const r = await request(
            routeName + '/' + kind + '/' + policy,
            url(server) + '/ok',
            policy,
            route,
          );
          const expected =
            kind === 'trusted' ||
            policy === false ||
            (mode === 'vulnerable' && routeName !== 'direct');
          assert.equal(r.ok, expected, JSON.stringify(records.at(-1)));
          if (!expected) {
            assert.notEqual(r.error, 'FIXTURE_DEADLINE');
            assert.equal(records.at(-1).originRequests, 0);
            if (kind === 'wrong-name') assert.equal(r.error, 'ERR_TLS_CERT_ALTNAME_INVALID');
          }
        }
      }
    }
    for (const policy of ['omitted', true, false]) {
      const r = await request(
        'invalid-outer-proxy/' + policy,
        url(good) + '/ok',
        policy,
        routes.badOuter,
      );
      assert.equal(r.ok, false);
      assert.notEqual(r.error, 'FIXTURE_DEADLINE');
      assert.equal(records.at(-1).originRequests, 0);
    }
    const plain = await tracked(http.createServer(handler)),
      plainURL = 'http://127.0.0.1:' + plain.address().port + '/a?b=1';
    for (const route of ['', routes.http]) {
      const r = await request(
        'normal-http/' + (route ? 'proxy' : 'direct'),
        plainURL,
        'omitted',
        route,
        { method: 'POST', headers: { 'x-fixture': 'retained' }, data: 'ordinary body' },
      );
      assert(r.ok);
      assert.deepEqual(JSON.parse(r.body), {
        path: route ? plainURL : '/a?b=1',
        method: 'POST',
        body: 'ordinary body',
        marker: 'retained',
      });
    }
    const relative = await request(
      'relative-redirect',
      url(good) + '/relative',
      'omitted',
      routes.http,
    );
    assert(relative.ok);
    assert.equal(JSON.parse(relative.body).path, '/ok');
    for (const suffix of ['bad-redirect', 'wrong-redirect']) {
      const r = await request(suffix, url(good) + '/' + suffix, true, routes.http);
      assert.equal(r.ok, mode === 'vulnerable');
      assert.notEqual(r.error, 'FIXTURE_DEADLINE');
    }
    process.env.HTTPS_PROXY = routes.http;
    const strict = await network.isURLAvailable(
      new URL(badURL),
      false,
      () => {},
      () => {},
    );
    const ignored = await network.isURLAvailable(
      new URL(badURL),
      true,
      () => {},
      () => {},
    );
    assert.equal(strict, mode === 'vulnerable');
    assert.equal(ignored, true);
    records.push({ name: 'availability-explicit-ignore', strict, ignored });
    const status = await request('normal-status-error', url(good) + '/status', true, routes.http);
    assert.equal(status.status, 503);
    process.env.HTTPS_PROXY = routes.http;
    await assert.rejects(
      network.fetchData(undefined, { url: url(good) + '/status', socketTimeout: 1000 }),
      /server returned code 503/,
    );
    records.push({ name: 'fetchData-status-rejection', passed: true });
    const timeout = await request('socket-timeout', url(good) + '/slow', true, routes.http, {
      socketTimeout: 30,
    });
    assert.equal(timeout.ok, false);
    assert.match(timeout.error, /timed out after 30ms/);
    const canceled = await request('cancel', url(good) + '/slow', true, routes.http, {
      cancelFixture: true,
    });
    assert.equal(canceled.ok, false);
    assert.match(canceled.error, /fixture cancel/);
    const denied = await request('CONNECT407', url(good) + '/ok', true, routes.reject);
    assert.equal(denied.ok, true);
    assert.equal(denied.status, 407);
    assert.equal(records.at(-1).originRequests, 0);
    const closed = await request('early-close', url(good) + '/close', true, routes.http);
    assert.equal(closed.ok, false);
    assert.notEqual(closed.error, 'FIXTURE_DEADLINE');
    process.env.HTTPS_PROXY = routes.http;
    process.env.NO_PROXY = '127.0.0.1';
    const proxyConnectionsBeforeBypass = proxyConnections;
    const bypass = await new Promise((resolve, reject) =>
      network.httpRequest(
        { url: url(good) + '/ok', socketTimeout: 1000 },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        },
        reject,
      ),
    );
    assert.equal(bypass, 200);
    assert.equal(proxyConnections, proxyConnectionsBeforeBypass);
    records.push({ name: 'NO_PROXY-bypass', status: bypass, proxyConnectionsAdded: 0 });
    proof = { mode, records, noExternalOriginOrInstaller: true };
    return proof;
  } finally {
    const closed = [...sockets].map(
      (socket) =>
        new Promise((resolve) => {
          if (socket.closed) resolve();
          else socket.once('close', resolve);
        }),
    );
    for (const socket of sockets) socket.destroy();
    const agents = require(
      path.join(root, 'e2e/node_modules/playwright-core/lib/server/utils/happyEyeballs.js'),
    );
    agents.httpHappyEyeballsAgent.destroy();
    agents.httpsHappyEyeballsAgent.destroy();
    await Promise.all(closed);
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    if (proof) {
      proof.closedSockets = sockets.size === 0;
      assert.equal(sockets.size, 0, 'All tracked loopback sockets must close');
    }
  }
}
module.exports = { run };
if (require.main === module) {
  const [root, fixturePath, mode] = process.argv.slice(2);
  run(root, JSON.parse(fs.readFileSync(fixturePath)), mode).then(
    (value) => console.log(JSON.stringify(value)),
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
