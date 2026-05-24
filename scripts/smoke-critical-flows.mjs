const baseUrl = process.env.SMOKE_API_BASE_URL || 'http://localhost:4000/api/v1';
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;

const required = (value, name) => {
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `${options.method || 'GET'} ${path} failed: ${response.status} ${JSON.stringify(body)}`,
    );
  }
  return body?.data ?? body;
};

const main = async () => {
  const health = await request('/health/ready').catch(async () => request('/health'));
  console.log('health', health.status ?? 'ok');

  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: required(email, 'SMOKE_EMAIL'),
      password: required(password, 'SMOKE_PASSWORD'),
    }),
  });
  const token = login.accessToken;
  const auth = { authorization: `Bearer ${token}` };

  await request('/auth/me', { headers: auth });
  await request('/surveys', { headers: auth });
  await request('/dashboard/summary', { headers: auth });
  await request('/billing/tokens/balance', { headers: auth });
  await request('/media/images', { headers: auth });
  await request('/billing/usage', { headers: auth });

  console.log('critical smoke checks passed');
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
