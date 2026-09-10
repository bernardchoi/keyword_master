import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({lookup:vi.fn(), request:vi.fn()}));
vi.mock('node:dns/promises', () => ({lookup:mocked.lookup}));
vi.mock('node:http', () => ({request:mocked.request}));
vi.mock('node:https', () => ({request:mocked.request}));
import { safeFetch } from './audit-fetch';
function respond(status=200, headers={}, body='ok') {
  return (_url: unknown, _options: unknown, callback: (res: unknown)=>void) => {
    const req = new EventEmitter() as EventEmitter & {end:()=>void};
    req.end = () => queueMicrotask(() => {
      const res = Object.assign(new PassThrough(), {statusCode:status, headers});
      callback(res); res.end(body);
    });
    return req;
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocked.lookup.mockResolvedValue([{address:'93.184.216.34',family:4}]);
  mocked.request.mockImplementation(respond());
});
describe('audit network boundary', () => {
  it('tries another validated address when the first network route fails', async () => {
    mocked.lookup.mockResolvedValue([{address:'8.8.8.8',family:4},{address:'2001:4860:4860::8888',family:6}]);
    mocked.request.mockImplementationOnce(() => {
      const req = new EventEmitter() as EventEmitter & {end:()=>void};
      req.end = () => queueMicrotask(()=>req.emit('error',Object.assign(new Error('unreachable'),{code:'ENETUNREACH'})));
      return req;
    });
    expect((await safeFetch('https://example.com')).fetched).toBe(true);
    expect(mocked.request.mock.calls[1][1].hostname).toBe('2001:4860:4860::8888');
  });
  it.each(['http://[::1]', 'http://[::]', 'http://[fea0::1]', 'http://[febf::1]', 'http://[fc00::1]', 'http://[::ffff:7f00:1]', 'http://127.1', 'http://localhost.'])('blocks %s before any connection', async (url) => {
    expect((await safeFetch(url)).fetched).toBe(false);
    expect(mocked.request).not.toHaveBeenCalled();
  });
  it('pins the approved address while retaining Host and TLS verification name', async () => {
    expect((await safeFetch('https://example.com/path')).fetched).toBe(true);
    expect(mocked.lookup).toHaveBeenCalledTimes(1);
    expect(mocked.request.mock.calls[0][1]).toMatchObject({hostname:'93.184.216.34',servername:'example.com',headers:{Host:'example.com'},agent:false});
  });
  it('rejects a mixed public/private DNS answer', async () => {
    mocked.lookup.mockResolvedValue([{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]);
    expect((await safeFetch('https://example.com')).fetched).toBe(false);
    expect(mocked.request).not.toHaveBeenCalled();
  });
  it('validates redirect destinations', async () => {
    mocked.request.mockImplementation(respond(302,{location:'http://[::1]/'}));
    expect((await safeFetch('https://example.com')).fetched).toBe(false);
    expect(mocked.request).toHaveBeenCalledTimes(1);
  });
  it('fails oversized responses instead of analyzing truncated text', async () => {
    mocked.request.mockImplementation(respond(200,{},'123456'));
    expect((await safeFetch('https://example.com',{maxBytes:5})).fetched).toBe(false);
  });
  it('bounds DNS wait and prevents a later connection after timeout', async () => {
    let finish!: (v: unknown)=>void;
    mocked.lookup.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    expect((await safeFetch('https://example.com',{timeoutMs:10})).fetched).toBe(false);
    finish([{address:'8.8.8.8',family:4}]);
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(mocked.request).not.toHaveBeenCalled();
  });
});
