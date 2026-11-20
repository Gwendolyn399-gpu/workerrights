// Credential-free in-memory stand-in for the Sites Function database SDK.
// Supports only the surface the application uses: from/select/eq/order/limit,
// insert, insertIfAbsent(onConflict), update; thenable {data,error}.
const clone = (value) => (value === undefined ? undefined : structuredClone(value));

class Query {
  constructor(tables, table) {
    this.tables = tables;
    this.table = table;
    this.filters = [];
    this.columns = null;
    this.orderKey = null;
    this.ascending = true;
    this.limitN = null;
    this.op = "select";
    this.payload = null;
    this.conflict = null;
  }
  select(columns) { this.columns = columns; return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  order(key, options = {}) { this.orderKey = key; this.ascending = options.ascending !== false; return this; }
  limit(count) { this.limitN = count; return this; }
  insert(value) { this.op = "insert"; this.payload = value; return this; }
  insertIfAbsent(value, options) { this.op = "insertIfAbsent"; this.payload = value; this.conflict = options.onConflict.split(",").map((s) => s.trim()); return this; }
  update(value) { this.op = "update"; this.payload = value; return this; }

  #rows() {
    if (!this.tables.has(this.table)) this.tables.set(this.table, []);
    return this.tables.get(this.table);
  }
  #matches(row) {
    return this.filters.every(([key, value]) => row[key] === value);
  }
  #project(row) {
    if (!this.columns || this.columns === "*") return clone(row);
    const out = {};
    for (const column of this.columns.split(",").map((s) => s.trim())) out[column] = clone(row[column]);
    return out;
  }
  #execute() {
    const all = this.#rows();
    if (this.op === "insert") {
      const row = clone(this.payload);
      all.push(row);
      return { data: [this.#project(row)], error: null };
    }
    if (this.op === "insertIfAbsent") {
      const exists = all.some((row) => this.conflict.every((key) => row[key] === this.payload[key]));
      if (exists) return { data: [], error: null };
      const row = clone(this.payload);
      all.push(row);
      return { data: [this.#project(row)], error: null };
    }
    let matched = all.filter((row) => this.#matches(row));
    if (this.op === "update") {
      for (const row of matched) Object.assign(row, clone(this.payload));
    }
    if (this.orderKey) {
      const key = this.orderKey;
      const dir = this.ascending ? 1 : -1;
      matched = [...matched].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
    }
    if (this.limitN !== null) matched = matched.slice(0, this.limitN);
    return { data: matched.map((row) => this.#project(row)), error: null };
  }
  then(resolve, reject) {
    try {
      resolve(this.#execute());
    } catch (error) {
      if (reject) reject(error);
      else throw error;
    }
  }
}

export function createFakeDb(initial = {}) {
  const tables = new Map();
  for (const [name, rows] of Object.entries(initial)) tables.set(name, rows.map(clone));
  return {
    from(table) { return new Query(tables, table); },
    _tables: tables,
  };
}