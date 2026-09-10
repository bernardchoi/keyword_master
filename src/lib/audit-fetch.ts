import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { FetchOutcome } from './audit';

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const bareHost = (host: string) => host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

export function isBlockedHostnameLiteral(hostname: string): boolean {
  const h = bareHost(hostname);
  return h === 'localhost' || ['.local', '.internal', '.localhost'].some((s) => h.endsWith(s));
}

export function isPrivateIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return true;
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19));
}

export function isPrivateIPv6(ip: string): boolean {
  const host = bareHost(ip);
  if (isIP(host) !== 6) return true;
  // URL 정규화로 확장형·대괄호·IPv4-mapped 표기를 일치시킨다.
  const normalized = bareHost(new URL(`http://[${host}]`).hostname);
  if (normalized.startsWith('::ffff:')) {
    const [hi, lo] = normalized.slice(7).split(':').map((v) => parseInt(v, 16));
    return isPrivateIPv4(`${hi >>> 8}.${hi & 255}.${lo >>> 8}.${lo & 255}`);
  }
  // 공개 글로벌 유니캐스트만 허용. 루프백·미지정·링크로컬·ULA·멀티캐스트·변환용 제외.
  const first = parseInt(normalized.split(':')[0], 16);
  return !(first >= 0x2000 && first <= 0x3fff) ||
    normalized.startsWith('2001:db8:') || normalized.startsWith('2002:') ||
    /^2001:(?:0:|:)/.test(normalized);
}

async function resolvePublic(hostname: string) {
  const host = bareHost(hostname);
  if (isBlockedHostnameLiteral(host)) throw new Error('내부 호스트는 조회할 수 없습니다.');
  const family = isIP(host);
  const addresses = family ? [{ address: host, family }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => a.family === 4 ? isPrivateIPv4(a.address) : isPrivateIPv6(a.address))) {
    throw new Error('사설·루프백·예약 IP는 조회할 수 없습니다.');
  }
  return [...addresses].sort((a,b) => a.family - b.family);
}

interface HopResult { status: number; text: string; location?: string }

/** 검증한 IP에 직접 연결하고 원래 Host와 TLS SNI/인증서 검증 이름을 유지한다. 재조회 없음. */
function fetchPinned(url: URL, address: string, signal: AbortSignal, maxBytes: number): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(url, {
      hostname: address,
      servername: isIP(bareHost(url.hostname)) ? '' : bareHost(url.hostname),
      agent: false,
      signal,
      headers: {
        Host: url.host,
        'Accept-Encoding': 'identity',
        'User-Agent': 'KeywordMasterAuditBot/1.0 (+https://keyword-master-delta.vercel.app)',
      },
    }, (res) => {
      const status = res.statusCode ?? 0;
      res.on('error', reject);
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        resolve({ status, text: '', location: res.headers.location });
        res.destroy();
        return;
      }
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
        reject(new Error('지원하지 않는 압축 응답입니다.'));
        res.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          reject(new Error(`응답 본문이 제한(${maxBytes}바이트)을 넘었습니다.`));
          res.destroy();
        } else chunks.push(chunk);
      });
      res.on('end', () => resolve({ status, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

export interface SafeFetchOptions { timeoutMs?: number; maxBytes?: number }

export async function safeFetchStatus(rawUrl: string, opts: SafeFetchOptions = {}): Promise<number | null> {
  const result = await safeFetch(rawUrl, opts);
  return result.fetched ? (result.status ?? null) : null;
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<FetchOutcome> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`조회가 ${timeoutMs}ms 안에 완료되지 않았습니다.`);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  const run = async (): Promise<FetchOutcome> => {
    let current = new URL(rawUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!['http:', 'https:'].includes(current.protocol)) throw new Error('http/https만 지원합니다.');
      if (current.username || current.password) throw new Error('인증정보가 포함된 URL은 지원하지 않습니다.');
      const approved = await resolvePublic(current.hostname);
      controller.signal.throwIfAborted();
      let res: HopResult | undefined;
      for (let i = 0; i < approved.length; i++) {
        try {
          res = await fetchPinned(current, approved[i].address, controller.signal, opts.maxBytes ?? DEFAULT_MAX_BYTES);
          break;
        } catch (error) {
          const code = error instanceof Error && 'code' in error ? String(error.code) : '';
          if (i === approved.length - 1 || !['ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ECONNRESET'].includes(code)) throw error;
        }
      }
      if (!res) throw new Error('연결 가능한 공개 주소가 없습니다.');
      if (res.location) { current = new URL(res.location, current); continue; }
      return { fetched: true, status: res.status, text: res.text, finalUrl: current.toString() };
    }
    throw new Error(`리다이렉트가 ${MAX_REDIRECTS}회를 넘었습니다.`);
  };
  try { return await Promise.race([run(), timeout]); }
  catch (error) { return { fetched: false, reason: error instanceof Error ? error.message : '조회에 실패했습니다.' }; }
  finally { clearTimeout(timer); }
}
