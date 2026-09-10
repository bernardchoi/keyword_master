import { describe, expect, it } from 'vitest';
import { alignTrends } from './trend-alignment';
import { parseStoredMap, isStoredRow } from './stored-data';
import { unownedBrand } from './tag-rules';
import { suggestTags } from './tag-suggest';
import { computeBatchRow } from './batch';
import { row } from './test-helpers';
describe('data integrity', () => {
  it('aligns different month ranges by dates, not array positions', () => {
    const point = (period:string,partial=false) => ({period,partial,ratio:50});
    const aligned = alignTrends([point('2026-01-01'),point('2026-02-01'),point('2026-03-01',true)],[point('2026-02'),point('2026-03')]);
    expect(aligned.search.map(p=>p.period)).toEqual(['2026-02-01']);
    expect(aligned.shopping.map(p=>p.period)).toEqual(['2026-02']);
  });
  it('discards malformed saved rows and safely preserves reserved names', () => {
    expect(parseStoredMap('null',isStoredRow)).toEqual({});
    expect(parseStoredMap('{"bad":null}',isStoredRow)).toEqual({});
    const saved = parseStoredMap(JSON.stringify({['__proto__']:row('__proto__',10)}),isStoredRow);
    expect(Object.hasOwn(saved,'__proto__')).toBe(true);
    expect(Object.getPrototypeOf(saved)).toBe(Object.prototype);
  });
  it('does not let the first owned brand hide a second unowned brand', () => {
    expect(unownedBrand('가나다브랜드 라마바브랜드', ['가나다브랜드'], ['가나다브랜드','라마바브랜드'])).toBe('라마바브랜드');
  });
  it('unknown competition does not mean masked search volume', () => {
    const result = suggestTags([row('경량 캠핑의자',1000)],'캠핑의자','',[],[]);
    expect(result.candidates[0]).toMatchObject({uncertain:true,masked:false});
  });
  it('inherited names do not count as analyzed data', () => {
    expect(computeBatchRow({line:1,keyword:'constructor',name:'의자',brands:[]},{},[],[]).status).toBe('error');
  });
});
