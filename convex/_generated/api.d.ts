/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as http from "../http.js";
import type * as http_auth from "../http/auth.js";
import type * as http_buckets from "../http/buckets.js";
import type * as http_chat from "../http/chat.js";
import type * as http_classify from "../http/classify.js";
import type * as http_messages from "../http/messages.js";
import type * as http_options from "../http/options.js";
import type * as http_session from "../http/session.js";
import type * as http_shared from "../http/shared.js";
import type * as http_threads from "../http/threads.js";
import type * as inbox from "../inbox.js";
import type * as rateLimit from "../rateLimit.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  http: typeof http;
  "http/auth": typeof http_auth;
  "http/buckets": typeof http_buckets;
  "http/chat": typeof http_chat;
  "http/classify": typeof http_classify;
  "http/messages": typeof http_messages;
  "http/options": typeof http_options;
  "http/session": typeof http_session;
  "http/shared": typeof http_shared;
  "http/threads": typeof http_threads;
  inbox: typeof inbox;
  rateLimit: typeof rateLimit;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
