import { httpRouter } from "convex/server";
import { getGoogleCallbackHandler, postGoogleStartHandler } from "./http/auth";
import {
	deleteBucketsHandler,
	postBucketsHandler,
	putBucketsHandler,
} from "./http/buckets";
import { postChatSearchHandler } from "./http/chat";
import { postClassifyHandler } from "./http/classify";
import {
	postCheckNewMessagesHandler,
	postMessageDetailHandler,
} from "./http/messages";
import { optionsHandler } from "./http/options";
import { postLogoutHandler } from "./http/session";
import { getThreadsHandler } from "./http/threads";

const http = httpRouter();

http.route({ path: "/api/threads", method: "GET", handler: getThreadsHandler });
http.route({ path: "/api/threads", method: "OPTIONS", handler: optionsHandler });

http.route({
	path: "/api/auth/google/callback",
	method: "GET",
	handler: getGoogleCallbackHandler,
});
http.route({
	path: "/api/auth/google/callback",
	method: "OPTIONS",
	handler: optionsHandler,
});

http.route({ path: "/api/classify", method: "POST", handler: postClassifyHandler });
http.route({ path: "/api/classify", method: "OPTIONS", handler: optionsHandler });

http.route({
	path: "/api/chat/search",
	method: "POST",
	handler: postChatSearchHandler,
});
http.route({
	path: "/api/chat/search",
	method: "OPTIONS",
	handler: optionsHandler,
});

http.route({ path: "/api/buckets", method: "POST", handler: postBucketsHandler });
http.route({ path: "/api/buckets", method: "OPTIONS", handler: optionsHandler });
http.route({ path: "/api/buckets", method: "PUT", handler: putBucketsHandler });
http.route({
	path: "/api/buckets",
	method: "DELETE",
	handler: deleteBucketsHandler,
});

http.route({
	path: "/api/messages/detail",
	method: "POST",
	handler: postMessageDetailHandler,
});
http.route({
	path: "/api/messages/detail",
	method: "OPTIONS",
	handler: optionsHandler,
});

http.route({
	path: "/api/messages/check-new",
	method: "POST",
	handler: postCheckNewMessagesHandler,
});
http.route({
	path: "/api/messages/check-new",
	method: "OPTIONS",
	handler: optionsHandler,
});

http.route({ path: "/api/logout", method: "POST", handler: postLogoutHandler });
http.route({ path: "/api/logout", method: "OPTIONS", handler: optionsHandler });

http.route({
	path: "/api/auth/google/start",
	method: "POST",
	handler: postGoogleStartHandler,
});
http.route({
	path: "/api/auth/google/start",
	method: "OPTIONS",
	handler: optionsHandler,
});

export default http;
