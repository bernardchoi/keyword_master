import { NextResponse } from 'next/server';

type Rule<T> = (value: unknown) => value is T;
type Rules = Record<string, Rule<unknown>>;
type Body<S extends Rules> = { [K in keyof S]?: S[K] extends Rule<infer T> ? T : never };
const MAX_BODY_BYTES = 32 * 1024;

export const textField = (max: number): Rule<string> =>
  (v): v is string => typeof v === 'string' && v.length <= max;
export const integerField: Rule<number> = (v): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v);
export const listField = (count: number, length: number): Rule<string[]> =>
  (v): v is string[] => Array.isArray(v) && v.length <= count && v.every(textField(length));
export const tagsField: Rule<string | string[]> = (v): v is string | string[] =>
  textField(4000)(v) || listField(20, 100)(v);

class InputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** JSON의 타입과 크기를 외부 API 호출 전에 검사한다. Content-Length만 신뢰하지 않는다. */
export async function readJsonBody<S extends Rules>(req: Request, rules: S): Promise<Body<S>> {
  const reader = req.body?.getReader();
  if (!reader) throw new InputError('요청 본문이 없습니다.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new InputError('요청 본문이 너무 큽니다 (최대 32KB).', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputError('JSON 객체를 입력해 주세요.');
  }
  for (const [key, rule] of Object.entries(rules)) {
    if (Object.hasOwn(value, key) && !rule((value as Record<string, unknown>)[key])) {
      throw new InputError(`${key} 값의 형식 또는 길이가 올바르지 않습니다.`);
    }
  }
  return value as Body<S>;
}

export function inputErrorResponse(error: unknown) {
  return NextResponse.json(
    { error: error instanceof InputError ? error.message : '잘못된 요청 형식입니다.' },
    { status: error instanceof InputError ? error.status : 400 },
  );
}
