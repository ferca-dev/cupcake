let appPromise = null;
let databasePromise = null;

const splitOrigins = (value = '') =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const applyCorsHeaders = (req, res) => {
  const requestOrigin = req.headers.origin;
  const allowList = splitOrigins(process.env.CORS_ORIGIN || 'http://localhost:5173');
  const isAllowed =
    !requestOrigin || allowList.includes('*') || allowList.includes(requestOrigin);

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
    const app = await getApp();
    app(req, res);
  } catch (err) {
    console.error(err);
    sendStartupError(req, res, err);
  }
}
