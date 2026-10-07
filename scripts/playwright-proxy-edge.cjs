const assert = require('node:assert/strict');
const path = require('node:path');
const https = require('node:https');
const tls = require('node:tls');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { Duplex, PassThrough } = require('node:stream');

const core = path.join(process.argv[2], 'e2e/node_modules/playwright-core');
for (const key of Object.keys(process.env)) {
  if (/^(?:https?_proxy|all_proxy|no_proxy|npm_config_(?:https?_proxy|proxy|noproxy))$/i.test(key))
    delete process.env[key];
}
process.env.HTTPS_PROXY = 'http://127.0.0.1:10999';
const network = require(path.join(core, 'lib/server/utils/network.js'));
const { registry } = require(path.join(core, 'lib/server/registry/index.js'));
let captured,
  tlsOptions,
  responseMode = 'none';
const metadata = [
  {
    Product: 'Stable',
    Releases: [
      {
        Platform: 'MacOS',
        Architecture: 'universal',
        Artifacts: [{ ArtifactName: 'pkg', Location: 'https://download.invalid/ordinary.pkg' }],
      },
    ],
  },
];
https.request = (options, onResponse) => {
  captured = options;
  const req = new EventEmitter();
  req.end = () => {
    if (responseMode === 'error')
      process.nextTick(() =>
        req.emit(
          'error',
          Object.assign(new Error('fixture invalid certificate'), {
            code: 'DEPTH_ZERO_SELF_SIGNED_CERT',
          }),
        ),
      );
    if (responseMode === 'valid') {
      const response = new PassThrough();
      response.statusCode = 200;
      response.headers = {};
      onResponse(response);
      response.end(JSON.stringify(metadata));
    }
  };
  req.destroy = () => {};
  req.setTimeout = () => {};
  return req;
};
tls.connect = (options) => {
  tlsOptions = options;
  return new Duplex({
    read() {},
    write(chunk, encoding, done) {
      done();
    },
  });
};
net.connect = () =>
  new Duplex({
    read() {},
    write(chunk, encoding, done) {
      assert.match(chunk.toString(), /^CONNECT edgeupdates\.microsoft\.com:443 HTTP\/1\.1/);
      this.push(Buffer.from('HTTP/1.1 200 Connection established\r\n\r\n'));
      done();
    },
  });

(async () => {
  const policies = [];
  for (const policy of ['omitted', true, false]) {
    const params = { url: 'https://edgeupdates.microsoft.com/api/products' };
    if (policy !== 'omitted') params.rejectUnauthorized = policy;
    network.httpRequest(
      params,
      () => {},
      (error) => {
        throw error;
      },
    );
    const expected = policy === 'omitted' ? undefined : policy;
    assert.equal(captured.rejectUnauthorized, expected);
    const socket = await captured.agent.callback(new EventEmitter(), {
      ...captured,
      host: 'edgeupdates.microsoft.com',
      port: 443,
      secureEndpoint: true,
    });
    assert.equal(tlsOptions.rejectUnauthorized, expected);
    assert.equal(tlsOptions.servername, 'edgeupdates.microsoft.com');
    socket.destroy();
    policies.push({
      policy,
      requestPolicy: captured.rejectUnauthorized,
      originTlsPolicy: tlsOptions.rejectUnauthorized,
    });
  }
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  let installed = 0,
    selected;
  registry._installChromiumChannel = async (channel, scripts, args) => {
    installed++;
    selected = { channel, scripts, args };
  };
  responseMode = 'error';
  await assert.rejects(
    registry._installMSEdgeChannel('msedge', { darwin: 'reinstall_msedge_stable_mac.sh' }),
    /fixture invalid certificate/,
  );
  assert.equal(installed, 0);
  assert.equal(captured.rejectUnauthorized, undefined);
  responseMode = 'valid';
  await registry._installMSEdgeChannel('msedge', { darwin: 'reinstall_msedge_stable_mac.sh' });
  assert.equal(installed, 1);
  assert.equal(selected.args[0], metadata[0].Releases[0].Artifacts[0].Location);
  assert.equal(captured.rejectUnauthorized, undefined);
  console.log(
    JSON.stringify({
      policies,
      failureStopsInstaller: true,
      normalMetadataRetained: true,
      noSocketsOrInstaller: true,
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
