const requisition = require("requisition");

function Lantier(dbURL, opts) {
	let session = AuthSession;

	async function request(dbName, path, method, data) {
		const req = requisition[method](`${dbURL}/${dbName}/${path}`);

		if (opts && opts.log)
			console.log("req", session, `${dbURL}/${dbName}/${path}`, method);

		if (session)
			req.cookie("AuthSession", session);

		if (data)
			req.type("application/json").send(data);

		const response = await req;

		return {
			headers: response.headers,
			cookies: response.cookies,
			lastModified: response.lastModified,
			etag: response.etag,
			body: await response.json(),
			status: response.statusCode
		}
	}

	return {
		use: dbName => {
			const dbObj =  Object.create({
				req: async (path, method, data) => await request(dbName, path, method, data),
				get: async docName => (await dbObj.req(docName, "get")).body,
				insert: async doc => (await dbObj.req("", "post", doc)).body,
				update: async (doc, docID) => (await dbObj.req(docID, "put", doc)).body,
				del: async (_id, _rev) => (await dbObj.req(`${_id}?rev=${_rev}`, "delete")).body,
				query: async queryObj => (await dbObj.req("_find", "post", queryObj)).body.docs
			});

			return dbObj;
		},

		login: async (name, password) => {
			const resp = await request(`_session`, "", "post", { name, password });

			session = resp.cookies.AuthSession;

			return {
				AuthSession: resp.cookies.AuthSession,
				response: resp.body
			};
		},

		session: async (AuthSession) => {
			session = AuthSession;
			const response = await request("_session", "", "get");

			console.log(response)

			return {
				AuthSession: session,
				response: response.body,
				status: response.statusCode
			};
		},
	}
}

module.exports = Lantier;
