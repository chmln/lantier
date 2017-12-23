const requisition = require("requisition");

function Lantier(dbURL, opts) {
	let session ;
	opts = Object.assign({
		adminMode: false,
		log: false,
		username: "",
		password: ""
	}, opts || {});

	const authURL = dbURL.replace(/:\/\//, `://${opts.username}:${opts.password}@`);

	async function request(dbName, path, method, data, adm) {
		const host = adm !== false ? authURL : dbURL;
		const req = requisition[method](`${host}/${dbName}/${path}`);

		if (opts.log)
			console.log("req", session, `${host}/${dbName}/${path}`, method);

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
				req: (path, method, data) => request(dbName, path, method, data),
				get: async docName => (await dbObj.req(docName, "get")).body,
				getAll: async keys => {
					const result = await dbObj.get(`_all_docs?include_docs=true` + keys ? `&keys=[${keys.join('","')}]` : "");

					if (result.rows) return result.rows;
					else {
						opts.log && console.error(result)
						throw new Error("Error fetching data")
					}
			},
				post: async doc => (await dbObj.req("", "post", doc)).body,
				put: async (doc, docID) => (await dbObj.req(docID, "put", doc)).body,
				del: async (_id, _rev) => (await dbObj.req(`${_id}?rev=${_rev}`, "delete")).body,
				query: async queryObj => (await dbObj.req("_find", "post", queryObj)).body.docs,
				bulkInsert: async docs => (await dbObj.req("_bulk_docs", "post", { docs })).body
			});

			return dbObj;
		},

		login: async (name, password) => {
			const response = await request(`_session`, "", "post", { name, password }, false);

			if (!opts.adminMode)
				session = response.cookies.AuthSession;

			return {
				AuthSession: response.cookies ? response.cookies.AuthSession : null,
				response: response.body,
				status: response.statusCode
			};
		},

		session: async (AuthSession) => {
			session = AuthSession;

			const response = await request("_session", "", "get", null, false);

			if (opts.log)
				console.log(response);

			if (opts.adminMode)
				session = undefined;

			return {
				AuthSession: session,
				response: response.body,
				status: response.statusCode
			};
		},
	}
}

module.exports = Lantier;
