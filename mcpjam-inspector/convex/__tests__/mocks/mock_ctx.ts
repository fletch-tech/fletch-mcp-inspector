/**
 * In-memory mock of Convex's ctx object (db, auth, storage).
 * Supports insert, get, patch, delete, query with withIndex and filter.
 */

type Doc = Record<string, any> & { _id: string; _creationTime: number };

let idCounter = 0;

export function createMockCtx(
  identity: Record<string, any> | null = null,
) {
  const tables: Record<string, Doc[]> = {};
  idCounter = 0;

  function getTable(name: string): Doc[] {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  const db = {
    insert: async (table: string, doc: Record<string, any>) => {
      const id = `mock_${table}_${++idCounter}`;
      const row = { ...doc, _id: id, _creationTime: Date.now() };
      getTable(table).push(row);
      return id;
    },
    get: async (id: string) => {
      for (const rows of Object.values(tables)) {
        const found = rows.find((r) => r._id === id);
        if (found) return { ...found };
      }
      return null;
    },
    patch: async (id: string, updates: Record<string, any>) => {
      for (const rows of Object.values(tables)) {
        const idx = rows.findIndex((r) => r._id === id);
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...updates };
          return;
        }
      }
      throw new Error(`Document not found: ${id}`);
    },
    delete: async (id: string) => {
      for (const [, rows] of Object.entries(tables)) {
        const idx = rows.findIndex((r) => r._id === id);
        if (idx >= 0) {
          rows.splice(idx, 1);
          return;
        }
      }
    },
    query: (table: string) => {
      const rows = getTable(table);
      let result = [...rows];

      const builder: any = {
        withIndex: (_indexName: string, filterFn: (q: any) => any) => {
          const conditions: Array<{ field: string; value: any }> = [];
          const q = {
            eq: (field: string, value: any) => {
              conditions.push({ field, value });
              return q;
            },
          };
          filterFn(q);
          result = result.filter((row) =>
            conditions.every((c) => row[c.field] === c.value),
          );
          return builder;
        },
        filter: (filterFn: (q: any) => any) => {
          const q = {
            eq: (a: any, b: any) => ({ type: "eq", a, b }),
            field: (name: string) => ({ type: "field", name }),
          };
          const condition = filterFn(q);
          if (condition?.type === "eq") {
            const fieldName =
              condition.a?.type === "field" ? condition.a.name : null;
            const value =
              condition.a?.type === "field" ? condition.b : condition.a;
            if (fieldName) {
              result = result.filter((row) => row[fieldName] === value);
            }
          }
          return builder;
        },
        unique: async () => {
          return result.length > 0 ? { ...result[0] } : null;
        },
        collect: async () => {
          return result.map((r) => ({ ...r }));
        },
      };
      return builder;
    },
  };

  const auth = {
    getUserIdentity: async () => identity,
  };

  const storage = {
    generateUploadUrl: async () => "https://upload.example.com/mock",
    getUrl: async (id: string) => `https://storage.example.com/${id}`,
    delete: async () => {},
  };

  return {
    db,
    auth,
    storage,
    _tables: tables,
  };
}
