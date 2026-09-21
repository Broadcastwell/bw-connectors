// Broadcastwell Looker Studio connector: a synchronous caller over UrlFetchApp.
//
// Routes, path building and query building come from packages/api through the
// generated BroadcastwellRoutes block (see scripts/build.mjs), so this file never
// spells a route. It does not use createClient() from packages/api because that
// client is Promise based: Looker Studio calls getData() and needs the rows as the
// return value, and no Apps Script documentation says an entry point may return a
// Promise. UrlFetchApp is synchronous, so a plain synchronous caller is simpler and
// certain.
// MIT licence, see LICENSE at the repository root.

var BwApi = (function () {
  var R = BroadcastwellRoutes;
  var CACHE_SECONDS = 300;
  var CACHE_MAX_CHARS = 90000;
  var MAX_PAGES = 50;
  var MAX_RETRY_WAIT_SECONDS = 5;

  function HttpError(status, code, detail, retryAfter, url) {
    this.name = 'BroadcastwellHttpError';
    this.status = status;
    this.code = code || (status ? 'http_' + status : 'network_error');
    this.detail = detail || '';
    this.retryAfter = retryAfter;
    this.url = url;
    this.message = 'Broadcastwell API ' + status + ' ' + this.code + ': ' + this.detail;
  }
  HttpError.prototype = Object.create(Error.prototype);
  HttpError.prototype.constructor = HttpError;

  // A key is bwp_ followed by 64 hex characters, or the public demo key.
  function looksLikeKey(key) {
    return typeof key === 'string' && (key === R.DEMO_KEY || /^bwp_[0-9a-fA-F]{64}$/.test(key));
  }

  // "me" (or blank) reads your own account. The demo key reads only the sample,
  // so with the demo key "me" becomes "sample", as createClient() does in packages/api.
  function accountFor(apiKey, account) {
    var a = String(account === undefined || account === null ? '' : account).trim();
    if (!a || a === 'me') return apiKey === R.DEMO_KEY ? R.SAMPLE_ACCOUNT : 'me';
    return a;
  }

  function urlFor(name, params) {
    var route = R.routes[name];
    if (!route) throw new TypeError('Unknown Broadcastwell route: ' + name);
    return R.DEFAULT_BASE_URL + R.buildPath(route, params) + R.buildQuery(route, params);
  }

  function lowerHeaders(headers) {
    var out = {};
    Object.keys(headers || {}).forEach(function (k) { out[k.toLowerCase()] = headers[k]; });
    return out;
  }

  function cacheKey(apiKey, url) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, apiKey + '\n' + url);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = (bytes[i] + 256) % 256;
      hex += (b < 16 ? '0' : '') + b.toString(16);
    }
    return 'bw1:' + hex;
  }

  function userCache() {
    try {
      return CacheService.getUserCache();
    } catch (e) {
      return null;
    }
  }

  function fetchOnce(apiKey, url) {
    var response;
    try {
      response = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: false,
        headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
      });
    } catch (e) {
      throw new HttpError(0, 'network_error', 'Could not reach the Broadcastwell API: ' + (e && e.message ? e.message : String(e)), null, url);
    }
    return {
      status: response.getResponseCode(),
      headers: lowerHeaders(response.getHeaders()),
      text: response.getContentText(),
    };
  }

  function parse(text) {
    try {
      return text ? JSON.parse(text) : null;
    } catch (e) {
      return null;
    }
  }

  // GET one route. Returns the parsed JSON body or throws HttpError.
  // Successful answers are cached per key and address for five minutes, because
  // Looker Studio calls getData once per chart and the demo key allows 30 requests a minute.
  function getJson(apiKey, name, params, options) {
    var o = options || {};
    var url = urlFor(name, params);
    var cache = o.cache === false ? null : userCache();
    var key = cache ? cacheKey(apiKey, url) : null;
    if (cache) {
      var hit = cache.get(key);
      if (hit) {
        var cached = parse(hit);
        if (cached !== null) return cached;
      }
    }
    var res = fetchOnce(apiKey, url);
    if (res.status === 429) {
      var wait = Number(res.headers['retry-after']);
      if (isFinite(wait) && wait >= 0 && wait <= MAX_RETRY_WAIT_SECONDS) {
        Utilities.sleep(Math.max(1, wait) * 1000);
        res = fetchOnce(apiKey, url);
      }
    }
    var body = parse(res.text);
    if (res.status < 200 || res.status >= 300) {
      var problem = body && typeof body === 'object' ? body : {};
      var retryAfter = Number(res.headers['retry-after']);
      throw new HttpError(res.status, problem.code, problem.detail || problem.title || '', isFinite(retryAfter) ? retryAfter : null, url);
    }
    if (body === null) throw new HttpError(res.status, 'bad_response', 'The answer was not JSON.', null, url);
    if (cache && res.text.length <= CACHE_MAX_CHARS) {
      try {
        cache.put(key, res.text, CACHE_SECONDS);
      } catch (e) {
        // A full cache is not an error.
      }
    }
    return body;
  }

  // GET every page of a paged route, following pagination.next_cursor.
  // Returns { items, pages, first } where first is the first page body.
  function getAll(apiKey, name, params, options) {
    if (!R.routes[name] || !R.routes[name].paged) throw new TypeError(name + ' does not page.');
    var items = [];
    var seen = {};
    var cursor;
    var first = null;
    var pages = 0;
    for (;;) {
      var p = Object.assign({}, params, { limit: 100, cursor: cursor });
      var page = getJson(apiKey, name, p, options);
      pages++;
      if (!first) first = page;
      var data = page && Array.isArray(page.data) ? page.data : [];
      for (var i = 0; i < data.length; i++) items.push(data[i]);
      var next = page && page.pagination ? page.pagination.next_cursor : null;
      if (!next || seen[next] || data.length === 0 || pages >= MAX_PAGES) break;
      seen[next] = true;
      cursor = next;
    }
    return { items: items, pages: pages, first: first };
  }

  return {
    HttpError: HttpError,
    looksLikeKey: looksLikeKey,
    accountFor: accountFor,
    urlFor: urlFor,
    getJson: getJson,
    getAll: getAll,
  };
})();
