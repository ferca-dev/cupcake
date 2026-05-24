const startedAt = new Date();

const counters = new Map();
const latencyBucketsMs = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
const latency = {
  count: 0,
  sumMs: 0,
  buckets: Object.fromEntries(latencyBucketsMs.map((bucket) => [bucket, 0])),
};

const labelsKey = (labels = {}) =>
  Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(',');

const metricKey = (name, labels = {}) => {
  const suffix = labelsKey(labels);
  return suffix ? `${name}{${suffix}}` : name;
};

export const incrementCounter = (name, labels = {}, amount = 1) => {
  const key = metricKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + amount);
};

export const recordHttpRequest = ({ method, route, statusCode, durationMs }) => {
  incrementCounter('http_requests_total', {
    method,
    route,
    status: statusCode,
    statusClass: `${Math.floor(Number(statusCode || 0) / 100)}xx`,
  });
  if (Number(statusCode) >= 500) {
    incrementCounter('http_errors_total', { method, route, status: statusCode });
  }
  latency.count += 1;
  latency.sumMs += durationMs;
  for (const bucket of latencyBucketsMs) {
    if (durationMs <= bucket) latency.buckets[bucket] += 1;
  }
};

export const recordOperationalEvent = (name, labels = {}, amount = 1) => {
  incrementCounter(name, labels, amount);
};

export const getMetricsSnapshot = () => ({
  startedAt,
  uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
  counters: Object.fromEntries(counters.entries()),
  httpLatency: {
    count: latency.count,
    sumMs: Math.round(latency.sumMs),
    averageMs: latency.count > 0 ? Math.round(latency.sumMs / latency.count) : 0,
    buckets: { ...latency.buckets },
  },
});

const promLabels = (key) => {
  const match = /^([^{]+)(?:\{(.+)\})?$/.exec(key);
  if (!match) return { name: key, labels: '' };
  const labels = match[2]
    ? `{${match[2]
        .split(',')
        .map((entry) => {
          const [label, value] = entry.split('=');
          return `${label}="${String(value).replace(/"/g, '\\"')}"`;
        })
        .join(',')}}`
    : '';
  return { name: match[1], labels };
};

export const renderPrometheusMetrics = () => {
  const lines = [
    '# HELP cupcake_process_uptime_seconds Process uptime in seconds.',
    '# TYPE cupcake_process_uptime_seconds gauge',
    `cupcake_process_uptime_seconds ${Math.floor((Date.now() - startedAt.getTime()) / 1000)}`,
    '# HELP cupcake_http_request_duration_ms HTTP request duration histogram.',
    '# TYPE cupcake_http_request_duration_ms histogram',
  ];

  let cumulative = 0;
  for (const bucket of latencyBucketsMs) {
    cumulative = latency.buckets[bucket];
    lines.push(`cupcake_http_request_duration_ms_bucket{le="${bucket}"} ${cumulative}`);
  }
  lines.push(`cupcake_http_request_duration_ms_bucket{le="+Inf"} ${latency.count}`);
  lines.push(`cupcake_http_request_duration_ms_count ${latency.count}`);
  lines.push(`cupcake_http_request_duration_ms_sum ${Math.round(latency.sumMs)}`);

  for (const [key, value] of counters.entries()) {
    const { name, labels } = promLabels(key);
    lines.push(`cupcake_${name}${labels} ${value}`);
  }
  return `${lines.join('\n')}\n`;
};

export const resetMetrics = () => {
  counters.clear();
  latency.count = 0;
  latency.sumMs = 0;
  for (const bucket of latencyBucketsMs) latency.buckets[bucket] = 0;
};
