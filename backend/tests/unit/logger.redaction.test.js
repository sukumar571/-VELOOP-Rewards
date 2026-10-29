const { createLogger } = require('../../src/config/logger.js');

/** Collect pino output lines through a minimal writable sink. */
function memorySink() {
  const chunks = [];
  return {
    chunks,
    get text() {
      return chunks.join('');
    },
    write(line) {
      chunks.push(line);
      return true;
    },
  };
}

describe('logger sensitive-data redaction', () => {
  it('scrubs top-level and nested secrets/PII while keeping the log line', () => {
    const sink = memorySink();
    const log = createLogger({ level: 'info', destination: sink });

    log.info(
      {
        password: 'sup3r-s3cret',
        pin: '411001',
        req: { headers: { authorization: 'Bearer leaked-token', cookie: 'session=abc' } },
        user: { email: 'winner@example.com', token: 'tok_live_xyz' },
        note: 'this text is not sensitive',
      },
      'user submitted claim',
    );

    const out = sink.text;
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('this text is not sensitive'); // benign fields survive
    // No secret value may appear anywhere in the serialized line.
    expect(out).not.toContain('sup3r-s3cret');
    expect(out).not.toContain('411001');
    expect(out).not.toContain('Bearer leaked-token');
    expect(out).not.toContain('tok_live_xyz');
    expect(out).not.toContain('session=abc');
  });

  it('redacts a logged error whose object carries a secret', () => {
    const sink = memorySink();
    const log = createLogger({ level: 'info', destination: sink });
    log.warn({ credentials: { accessToken: 'abc.def.ghi' } }, 'auth failure');
    expect(sink.text).not.toContain('abc.def.ghi');
    expect(sink.text).toContain('[REDACTED]');
  });
});
