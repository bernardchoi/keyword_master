import { lookup } from 'node:dns/promises';
import type { FetchOutcome } from './audit';

/**
 * 사용자가 입력한 임의의 URL을 서버에서 대신 fetch한다 — SSRF 위험이 있는 지점이다.
 * (사내망·클라우드 메타데이터 엔드포인트로 요청을 대신 쏘게 만드는 공격.)
 *
 * 막는 것: ① http/https 외 프로토콜, ② localhost류 리터럴, ③ DNS가 가리키는
 * 사설/루프백/링크로컬 IP, ④ 리다이렉트를 수동으로 따라가며 매 홉 재검증.
 * 완벽한 방어(DNS 리바인딩 등)는 아니지만, 일반적인 SSRF 벡터는 막는다.
 */

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2MB

const BLOCKED_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost'];
const BLOCKED_HOSTNAMES = new Set(['localhost']);

export function isBlockedHostnameLiteral(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  return BLOCKED_HOSTNAME_SUFFIXES.some((suf) => h.endsWith(suf));
}

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // 파싱 실패는 안전 쪽으로
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local (클라우드 메타데이터 169.254.169.254 포함)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // 멀티캐스트(224+) · 예약(240+)
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
  // IPv4-mapped(::ffff:a.b.c.d)면 내부 IPv4 규칙으로 다시 검사
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (isBlockedHostnameLiteral(hostname)) {
    throw new Error(`내부 호스트로 보이는 주소는 조회할 수 없습니다: ${hostname}`);
  }
  // 이미 IP 리터럴이면 DNS 조회 없이 바로 검사
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) throw new Error(`사설/루프백 IP는 조회할 수 없습니다: ${hostname}`);
    return;
  }
  if (hostname.includes(':')) {
    if (isPrivateIPv6(hostname)) throw new Error(`사설/루프백 IP는 조회할 수 없습니다: ${hostname}`);
    return;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`도메인을 확인할 수 없습니다: ${hostname}`);
  }
  for (const { address, family } of addresses) {
    const blocked = family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
    if (blocked) throw new Error(`${hostname}이(가) 내부 IP(${address})를 가리킵니다.`);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

/** 상태 코드만 필요할 때(404 프로브 등) — 본문은 버린다. */
export async function safeFetchStatus(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<number | null> {
  const result = await safeFetch(rawUrl, opts);
  return result.fetched ? (result.status ?? null) : null;
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<FetchOutcome> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { fetched: false, reason: '유효하지 않은 URL입니다.' };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      return { fetched: false, reason: 'http/https만 지원합니다.' };
    }
    try {
      await assertPublicHost(current.hostname);
    } catch (err) {
      return { fetched: false, reason: err instanceof Error ? err.message : '차단된 호스트입니다.' };
    }

    try {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'KeywordMasterAuditBot/1.0 (+https://keyword-master-delta.vercel.app)' },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return { fetched: true, status: res.status, text: '' };
        current = new URL(location, current);
        continue; // 다음 홉에서 재검증
      }

      const text = await readCapped(res, maxBytes);
      return { fetched: true, status: res.status, text };
    } catch (err) {
      const reason =
        err instanceof Error && err.name === 'TimeoutError'
          ? `응답이 ${timeoutMs}ms 안에 오지 않았습니다.`
          : err instanceof Error
            ? err.message
            : '알 수 없는 오류';
      return { fetched: false, reason };
    }
  }
  return { fetched: false, reason: `리다이렉트가 ${MAX_REDIRECTS}회를 넘었습니다.` };
}
