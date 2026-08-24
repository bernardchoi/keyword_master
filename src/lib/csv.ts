/**
 * 다중 상품 일괄 처리 입력 파서.
 *
 * 형식은 `키워드,상품명,브랜드(선택)` 한 줄에 하나다. 쉼표로 구분하되
 * 상품명·브랜드에 쉼표가 들어갈 수 있어(`"여성, 여름 원피스"`) 따옴표로
 * 감싼 필드는 표준 CSV 규칙대로 푼다. 브랜드는 다시 세미콜론(`;`)으로
 * 여러 개를 받는다 — `내가 직접 취급하는 브랜드` 입력칸과 같은 구분자를
 * 쓰면 헷갈리므로 쉼표(필드 구분자)와 겹치지 않는 세미콜론을 쓴다.
 */

export interface BatchInputRow {
  /** 원본 줄 번호(1부터) — 오류 메시지에서 어느 줄인지 가리키는 용도 */
  line: number;
  keyword: string;
  name: string;
  brands: string[];
}

export interface BatchParseResult {
  rows: BatchInputRow[];
  /** `줄 3: 키워드가 비어 있습니다` 형태의 사람이 읽는 오류 */
  errors: string[];
}

/** CSV 한 줄을 필드 배열로 쪼갠다. 따옴표로 감싼 필드 안의 쉼표·줄바꿈·이스케이프(`""`)를 지킨다. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur === '') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

/** 헤더로 보이는 첫 줄인지 — `키워드`·`상품명` 이 그대로 들어 있으면 데이터가 아니라 표제로 본다 */
function looksLikeHeader(fields: string[]): boolean {
  const joined = fields.join('').replace(/\s+/g, '');
  return joined.includes('키워드') && joined.includes('상품명');
}

export function parseBatchInput(raw: string): BatchParseResult {
  const lines = raw.split(/\r?\n/);
  const rows: BatchInputRow[] = [];
  const errors: string[] = [];

  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = rawLine.trim();
    if (line.length === 0) return;

    const fields = splitCsvLine(line);
    if (lineNo === 1 && looksLikeHeader(fields)) return; // 헤더 줄은 건너뛴다

    const [keyword = '', name = '', brandsRaw = ''] = fields;
    if (!keyword) {
      errors.push(`줄 ${lineNo}: 키워드가 비어 있습니다.`);
      return;
    }
    if (!name) {
      errors.push(`줄 ${lineNo}: 상품명이 비어 있습니다.`);
      return;
    }

    const brands = brandsRaw
      .split(';')
      .map((b) => b.trim())
      .filter(Boolean);

    rows.push({ line: lineNo, keyword, name, brands });
  });

  return { rows, errors };
}
