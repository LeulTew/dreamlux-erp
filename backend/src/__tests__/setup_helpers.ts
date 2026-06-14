import { mock } from "bun:test";
import jwt from "jsonwebtoken";

export const mockQuery = mock(() => Promise.resolve({ rows: [] as Record<string, unknown>[] }));
export const mockUploadImage = mock(() => Promise.resolve());
export const mockDeleteImage = mock(() => Promise.resolve());
export const mockGetPublicUrl = mock(
  (key: string) => `https://storage.test.com/${key}`
);

export function getToken(): string {
  const secret = process.env.JWT_SECRET || "dev-secret";
  return jwt.sign({ role: "SUPER_ADMIN", permissions: { all: true } }, secret, { expiresIn: "1h" });
}

export interface FakeChain {
  select: (...args: any[]) => FakeChain;
  eq: (...args: any[]) => FakeChain;
  neq: (...args: any[]) => FakeChain;
  is: (...args: any[]) => FakeChain;
  not: (...args: any[]) => FakeChain;
  or: (...args: any[]) => FakeChain;
  order: (...args: any[]) => FakeChain;
  range: (...args: any[]) => FakeChain;
  update: (...args: any[]) => FakeChain;
  insert: (...args: any[]) => FakeChain;
  delete: (...args: any[]) => FakeChain;
  in: (...args: any[]) => FakeChain;
  limit: (...args: any[]) => FakeChain;
  single: () => FakeChain;
  maybeSingle: () => FakeChain;
  match: (...args: any[]) => FakeChain;
  ilike: (...args: any[]) => FakeChain;
  then: (resolve: (value: any) => void) => Promise<void>;
}

export const fakeChain = (initialSingle = false): FakeChain => {
  let isSingle = initialSingle;
  const chain: any = {
    select: mock(() => chain),
    eq: mock(() => chain),
    neq: mock(() => chain),
    is: mock(() => chain),
    not: mock(() => chain),
    or: mock(() => chain),
    order: mock(() => chain),
    range: mock(() => chain),
    update: mock(() => chain),
    insert: mock(() => chain),
    delete: mock(() => chain),
    in: mock(() => chain),
    limit: mock(() => chain),
    match: mock(() => chain),
    ilike: mock(() => chain),
    single: mock(() => {
      isSingle = true;
      return chain;
    }),
    maybeSingle: mock(() => {
      isSingle = true;
      return chain;
    }),
    then: mock((resolve: any) => {
      mockQuery().then((res: any) => {
        if (!res) return resolve({ data: null, error: null, count: 0 });
        
        let countValue: number;
        if (res?.rows?.[0]?.count !== undefined) {
          countValue = parseInt(res.rows[0].count as string);
        } else {
          countValue = res?.rows?.length || 0;
        }

        const rows = res?.rows || [];
        resolve({
          data: isSingle ? (rows[0] || null) : rows,
          error: null,
          count: countValue,
        });
      }).catch((err: any) => {
        resolve({ data: null, error: err, count: 0 });
      });
    })
  };
  return chain;
};


