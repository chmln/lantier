import * as requisition from "requisition";

interface Response {
  ok: boolean;
  id: string;
  rev: string;
  error?: string;
}

interface DeleteResponse {
  ok: boolean;
  rev: string;
}

type New<T> = T & { _id?: string; _rev?: string };
type DbDoc<T> = T & { _id: string; _rev: string };
type Doc<T> = DbDoc<T> & {
  error?: string;
  reason?: string;
};

interface Db<T> {
  req: (path: string, method: string, opts?: any) => Promise<any>;
  get: (docName: string) => Promise<Doc<T>>;
  getAll: (keys?: string[]) => Promise<Array<{ doc: Doc<T> }>>;
  post: (doc: New<T> | DbDoc<T>) => Promise<Response>;
  put: (doc: New<T>, docID: string) => Promise<Response>;
  del: (_id: string, _rev: string) => Promise<DeleteResponse>;
  query: (queryObj: any) => Promise<Array<DbDoc<T>>>;
  bulkInsert: (docs: Array<New<T>>) => Promise<Array<Response>>;
}

interface Session {
  response: {
    ok: boolean;
    error?: string;
    userCtx: {
      name: string;
      roles: string[];
    };
  };
  AuthSession: string;
}

interface Login {
  response: {
    ok: boolean;
    error?: string;
    name: string;
    roles: string[];
  };
  AuthSession: string;
}

interface Lantier<D> {
  use: <N extends keyof D>(dbName: N) => Db<D[N]>;
  session: (session: string) => Promise<Session>;
  login: (username: string, password: string) => Promise<Login>;
}

interface InitOptions {
  adminMode?: boolean;
  username: string;
  password: string;
  log?: boolean;
}

function Lantier<D>(dbURL: string, opts: InitOptions): Lantier<D> {
  let session: string | undefined;
  opts = Object.assign(
    {
      adminMode: false,
      log: false,
      username: "",
      password: "",
    },
    opts || {}
  );

  const authURL = dbURL.replace(
    /:\/\//,
    `://${opts.username}:${opts.password}@`
  );

  async function request(
    dbName: keyof D | "_session",
    path: string,
    method: string,
    data: any,
    adm?: boolean
  ) {
    const host = adm !== false ? authURL : dbURL;
    const req = requisition[method](`${host}/${dbName}/${path}`);

    if (opts.log)
      console.log("req", session, `${host}/${dbName}/${path}`, method);

    if (session) req.cookie("AuthSession", session);

    if (data) req.type("application/json").send(data);

    const response = await req;

    return {
      headers: response.headers,
      cookies: response.cookies,
      lastModified: response.lastModified,
      etag: response.etag,
      body: await response.json(),
      status: response.statusCode,
    };
  }

  return {
    use: <N extends keyof D>(dbName: N): Db<D[N]> => {
      const dbObj: Db<D[N]> = {
        req: (path, method, data) => request(dbName, path, method, data),
        get: async docName => (await dbObj.req(docName, "get")).body,
        getAll: async keys => {
          const result: any = await dbObj.get(
            `_all_docs?include_docs=true` +
              (keys ? `&keys=${JSON.stringify(keys)}` : "")
          );

          if (result.rows) return result.rows;
          else if (result.error) {
            opts.log && console.error(result);
            throw new Error(`Error: ${result.error}, reason: ${result.reason}`);
          }
        },
        post: async doc => (await dbObj.req("", "post", doc)).body,
        put: async (doc, docID) => (await dbObj.req(docID, "put", doc)).body,
        del: async (_id, _rev) =>
          (await dbObj.req(`${_id}?rev=${_rev}`, "delete")).body,
        query: async queryObj =>
          (await dbObj.req("_find", "post", queryObj)).body.docs,
        bulkInsert: async docs =>
          (await dbObj.req("_bulk_docs", "post", { docs })).body,
      };

      return dbObj;
    },

    login: async (name, password) => {
      const response = await request(
        `_session`,
        "",
        "post",
        { name, password },
        false
      );

      if (!opts.adminMode) session = response.cookies.AuthSession;

      return {
        AuthSession: response.cookies ? response.cookies.AuthSession : null,
        response: response.body,
        status: response.status,
      };
    },

    session: async AuthSession => {
      session = AuthSession;

      const response = await request("_session", "", "get", null, false);

      if (opts.log) console.log(response);

      if (opts.adminMode) session = undefined;

      return {
        AuthSession: session!,
        response: response.body,
        status: response.status,
      };
    },
  };
}

export default Lantier;
