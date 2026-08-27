import { describe, expect, it } from 'vitest';
import { isBlockedHostnameLiteral, isPrivateIPv4, isPrivateIPv6 } from './audit-fetch';

describe('isBlockedHostnameLiteral', () => {
  it('localhost류 리터럴을 막는다', () => {
    expect(isBlockedHostnameLiteral('localhost')).toBe(true);
    expect(isBlockedHostnameLiteral('LOCALHOST')).toBe(true);
    expect(isBlockedHostnameLiteral('printer.local')).toBe(true);
    expect(isBlockedHostnameLiteral('app.internal')).toBe(true);
  });

  it('공개 도메인은 통과시킨다', () => {
    expect(isBlockedHostnameLiteral('example.com')).toBe(false);
    expect(isBlockedHostnameLiteral('keyword-master-delta.vercel.app')).toBe(false);
  });
});

describe('isPrivateIPv4', () => {
  it('사설·루프백·링크로컬 대역을 막는다', () => {
    expect(isPrivateIPv4('127.0.0.1')).toBe(true);
    expect(isPrivateIPv4('10.1.2.3')).toBe(true);
    expect(isPrivateIPv4('192.168.0.1')).toBe(true);
    expect(isPrivateIPv4('172.16.0.1')).toBe(true);
    expect(isPrivateIPv4('172.31.255.255')).toBe(true);
    expect(isPrivateIPv4('169.254.169.254')).toBe(true); // 클라우드 메타데이터 엔드포인트
    expect(isPrivateIPv4('100.64.0.1')).toBe(true); // CGNAT
  });

  it('172.15/172.32는 172.16.0.0/12 밖이라 막지 않는다', () => {
    expect(isPrivateIPv4('172.15.0.1')).toBe(false);
    expect(isPrivateIPv4('172.32.0.1')).toBe(false);
  });

  it('공개 IP는 통과시킨다', () => {
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateIPv4('1.1.1.1')).toBe(false);
  });

  it('파싱할 수 없는 값은 안전하게 차단한다', () => {
    expect(isPrivateIPv4('not-an-ip')).toBe(true);
  });
});

describe('isPrivateIPv6', () => {
  it('루프백·링크로컬·유니크로컬을 막는다', () => {
    expect(isPrivateIPv6('::1')).toBe(true);
    expect(isPrivateIPv6('fe80::1')).toBe(true);
    expect(isPrivateIPv6('fd00::1')).toBe(true);
  });

  it('IPv4-mapped 주소는 내부 IPv4 규칙으로 재검사한다', () => {
    expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false);
  });

  it('공개 IPv6은 통과시킨다', () => {
    expect(isPrivateIPv6('2001:4860:4860::8888')).toBe(false);
  });
});
