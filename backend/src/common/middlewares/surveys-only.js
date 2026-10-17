import { AppError } from '../errors/app-error.js';

export const disabledFeatureError = () =>
  new AppError('Messaging and billing are disabled for this installation', {
    statusCode: 403,
    code: 'FEATURE_DISABLED',
  });

export const surveysOnlyMiddleware = (env) => (req, _res, next) => {
  if (!env.SURVEYS_ONLY) return next();
  const path = req.path.toLowerCase();
  const planRead =
    req.method === 'GET' && /^\/billing\/(plan|usage|plans\/(available|catalogue))\/?$/.test(path);
  const disabled =
    /^(\/campaigns|\/transactions|\/billing|\/webhooks)(\/|$)/.test(path) ||
    /^\/admin\/(token-packages|token-purchases|channel-pricing|payments|payment-webhooks|subscription-plans|subscriptions)(\/|$)/.test(
      path,
    ) ||
    /^\/admin\/tenants\/[^/]+\/(token-wallet|send-limits|token-adjustments|invitations)(\/|$)/.test(
      path,
    ) ||
    /^\/developer\/webhooks(\/|$)/.test(path) ||
    /^\/auth\/(forgot-password|reset-password)(\/|$)/.test(path) ||
    /^\/team\/invitations(\/|$)/.test(path);
  return disabled && !planRead ? next(disabledFeatureError()) : next();
};
