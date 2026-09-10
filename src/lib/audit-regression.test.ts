import { describe, expect, it } from 'vitest';
import { extractH1Texts, extractMetaContent, extractBodyText, parseRobots, robotsAllows, gradeSeo } from './audit';
describe('audit regression', () => {
  it('handles repeated unclosed tags without repeated suffix searches', () => {
    const html = '<h1>'.repeat(200000);
    const start = performance.now();
    expect(extractH1Texts(html)).toEqual([]);
    expect(extractBodyText('<script>'.repeat(100000))).toBe('');
    expect(performance.now() - start).toBeLessThan(2000);
  });
  it('keeps apostrophes inside double quoted metadata', () => {
    expect(extractMetaContent('<meta name="description" content="women\'s clothes">','description')).toBe("women's clothes");
  });
  it('groups consecutive agents and ignores empty Disallow', () => {
    const rules = parseRobots('User-agent: A\nUser-agent: B\nDisallow: /private\nAllow: /private/public\nUser-agent: *\nDisallow:');
    expect(robotsAllows(rules,'a','/private')).toBe(false);
    expect(robotsAllows(rules,'b','/private')).toBe(false);
    expect(robotsAllows(rules,'a','/private/public')).toBe(true);
    expect(robotsAllows(rules,'other')).toBe(true);
  });
  it('supports special object keys and wildcard end anchoring', () => {
    const rules = parseRobots('User-agent: constructor\nDisallow: /*.pdf$\nAllow: /public.pdf');
    expect(robotsAllows(rules,'constructor','/secret.pdf')).toBe(false);
    expect(robotsAllows(rules,'constructor','/secret.pdf?download')).toBe(true);
    expect(robotsAllows(rules,'constructor','/public.pdf')).toBe(true);
  });
  it('does not grade an HTTP error page as successful content', () => {
    const missing = {fetched:false};
    const result = gradeSeo({pageUrl:'https://example.com',page:{fetched:true,status:404,text:'<h1>404</h1>'},robots:missing,sitemap:missing,llms:missing,notFoundStatus:404});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({id:'fetch',status:'fail'});
  });
});
