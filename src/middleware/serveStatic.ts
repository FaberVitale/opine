/*!
 * Port of serve-static (https://github.com/expressjs/serve-static) for Deno.
 *
 * Licensed as follows:
 *
 * (The MIT License)
 * 
 * Copyright (c) 2010 Sencha Inc.
 * Copyright (c) 2011 LearnBoost
 * Copyright (c) 2011 TJ Holowaychuk
 * Copyright (c) 2014-2016 Douglas Christopher Wilson
 * 
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 * 
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 */

import {
  join,
  fromFileUrl,
  createError,
  escapeHtml,
  encodeUrl,
} from "../../deps.ts";
import { originalUrl as original, parseUrl } from "../utils/parseUrl.ts";
import {
  Response,
  Request,
  NextFunction,
  Handler,
  ParsedURL,
} from "../types.ts";

// TODO: header options, and various other error handling, see:
// - notes in response.ts for `res.sendFile()`
// - notes in response.ts for `res.download()`
// - https://github.com/expressjs/serve-static/#options
/**
 * Serve static files.
 * 
 * @param {string} root
 * @param {object} [options]
 * @return {Handler}
 * @public
 */
export function serveStatic(root: string, options: any = {}): Handler {
  // fall-though
  const fallthrough = options.fallthrough !== false;

  // default redirect
  const redirect = options.redirect !== false;

  // before hook
  const before = options.before;

  if (before && typeof before !== "function") {
    throw new TypeError("option before must be function");
  }

  // setup options for send
  const rootPath = root.startsWith("file:") ? fromFileUrl(root) : root;

  // construct directory listener
  const onDirectory = redirect
    ? createRedirectDirectoryListener()
    : createNotFoundDirectoryListener();

  return async function serveStatic(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (fallthrough) {
        return next();
      }

      // method not allowed
      res.status = 405;
      res.set("Allow", "GET, HEAD");
      res.end();
      return;
    }

    const forwardError = !fallthrough;
    const originalUrl = original(req) as ParsedURL;
    let path = (parseUrl(req) as ParsedURL).pathname;

    // make sure redirect occurs at mount
    if (path === "/" && originalUrl.pathname.substr(-1) !== "/") {
      path = "";
    }

    const fullPath = join(rootPath, path);

    let stat: Deno.FileInfo;
    try {
      stat = await Deno.stat(fullPath);
    } catch (err) {
      if (forwardError) {
        return next(err);
      }

      return next();
    }

    if (stat.isDirectory) {
      return onDirectory(res, req, next, forwardError, fullPath);
    }

    if (before) {
      await before(res, path, stat);
    }

    try {
      await res.sendFile(fullPath);
    } catch (err) {
      if (forwardError) {
        return next(err);
      }

      next();
    }
  };
}

/**
 * Collapse all leading slashes into a single slash
 * @private
 */
function collapseLeadingSlashes(str: string): string {
  let i = 0;
  for (; i < str.length; i++) {
    if (str.charCodeAt(i) !== 0x2f /* / */) {
      break;
    }
  }

  return i > 1 ? "/" + str.substr(i) : str;
}

/**
 * Create a minimal HTML document.
 *
 * @param {string} title
 * @param {string} body
 * @private
 */
function createHtmlDocument(title: string, body: string): string {
  return "<!DOCTYPE html>\n" +
    '<html lang="en">\n' +
    "<head>\n" +
    '<meta charset="utf-8">\n' +
    "<title>" + title + "</title>\n" +
    "</head>\n" +
    "<body>\n" +
    "<pre>" + body + "</pre>\n" +
    "</body>\n" +
    "</html>\n";
}

/**
 * Create a directory listener that just 404s.
 * @private
 */
function createNotFoundDirectoryListener(): Function {
  return function notFound(
    this: any,
    res: Response,
    req: Request,
    next: NextFunction,
    forwardError: boolean,
  ): void {
    if (forwardError) {
      return next(createError(404));
    }

    next();
  };
}

/**
 * Create a directory listener that performs a redirect.
 * @private
 */
function createRedirectDirectoryListener(): Function {
  return function redirect(
    this: any,
    res: Response,
    req: Request,
    next: NextFunction,
    forwardError: boolean,
    fullPath: string,
  ): void {
    if (fullPath.endsWith("/")) {
      if (forwardError) {
        return next(createError(404));
      }

      return next();
    }

    // get original URL
    const originalUrl = original(this.req) as ParsedURL;

    // append trailing slash
    originalUrl.path = null;
    originalUrl.pathname = collapseLeadingSlashes(originalUrl.pathname + "/");

    // reformat the URL
    const loc = encodeUrl(new URL(originalUrl).toString());
    const doc = createHtmlDocument(
      "Redirecting",
      'Redirecting to <a href="' + escapeHtml(loc) + '">' +
        escapeHtml(loc) + "</a>",
    );

    // send redirect response
    res.status = 301;
    res.set("Content-Security-Policy", "default-src 'none'");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Location", loc);
    res.send(doc);
  };
}
