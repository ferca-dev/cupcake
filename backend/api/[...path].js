let appPromise = null;
let databasePromise = null;

const splitOrigins = (value = '') =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const isAllowedVercelPreviewOrigin = (origin) => {
  try {
    const requestUrl = new URL(origin);
    const frontendUrl = new URL(process.env.FRONTEND_URL || '');
    if (requestUrl.protocol !== 'https:' || frontendUrl.hostname.endsWith('.vercel.app') === false) {
      return false;
    }

    const projectName = frontendUrl.hostname.replace(/\.vercel\.app$/, '');
    return (
      requestUrl.hostname.endsWith('.vercel.app') &&
      requestUrl.hostname.startsWith(`${projectName}-`)
    );
  } catch {
    return false;
  }
};

const applyCorsHeaders = (req, res) => {
  const requestOrigin = req.headers.origin;
  const allowList = splitOrigins(process.env.CORS_ORIGIN || 'http://localhost:5173');
  const isAllowed =
    !requestOrigin ||
    allowList.includes('*') ||
    allowList.includes(requestOrigin) ||
    isAllowedVercelPreviewOrigin(requestOrigin);

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
  res.setHeader('Access-Control-Max-Age', '600');

  if (requestOrigin && isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  } else if (!requestOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowList.includes('*') ? '*' : allowList[0]);
  }

  return isAllowed;
};

const ensureDatabase = async (mongoose, connectDatabase) => {
  if (mongoose.connection.readyState === 1) return;
  if (!databasePromise) {
    databasePromise = connectDatabase().catch((err) => {
      databasePromise = null;
      throw err;
    });
  }
  await databasePromise;
};

const removeSearchParam = (url, param) => {
  if (typeof url !== 'string' || !url.includes('?')) return url;

  const parsed = new URL(url, 'http://localhost');
  if (!parsed.searchParams.has(param)) return url;

  parsed.searchParams.delete(param);
  const query = parsed.searchParams.toString();
  return `${parsed.pathname}${query ? `?${query}` : ''}`;
};

export const stripVercelRoutingQuery = (req) => {
  // Vercel exposes catch-all route params on req.query. Express then treats the
  // synthetic `path` param as user query input, which strict Zod schemas reject.
  if (req?.query && Object.prototype.hasOwnProperty.call(req.query, 'path')) {
    delete req.query.path;
  }

  if (req) {
    req.url = removeSearchParam(req.url, 'path');
    req.originalUrl = removeSearchParam(req.originalUrl, 'path');
  }
};

const getApp = async () => {
  if (!appPromise) {
    appPromise = (async () => {
      const [{ createApp }, { connectDatabase, mongoose }] = await Promise.all([
        import('../src/app.js'),
        import('../src/config/database.js'),
      ]);
      await ensureDatabase(mongoose, connectDatabase);
      return createApp();
    })().catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
};

const sendStartupError = (req, res, err) => {
  applyCorsHeaders(req, res);
  const isProduction = process.env.APP_ENV === 'production';
  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      success: false,
      error: {
        code: 'SERVERLESS_STARTUP_ERROR',
        message: isProduction ? 'Backend startup failed' : err?.message || 'Backend startup failed',
      },
    }),
  );
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    const isAllowed = applyCorsHeaders(req, res);
    res.statusCode = isAllowed ? 204 : 403;
    res.end();
    return;
  }

  try {
    stripVercelRoutingQuery(req);
    const app = await getApp();
    app(req, res);
  } catch (err) {
    console.error(err);
    sendStartupError(req, res, err);
  }
}
