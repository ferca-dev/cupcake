import * as transactionService from './transaction.service.js';
import { listTransactionsQuerySchema } from './transaction.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const resolveRequestedTenantId = (req) => req.tenantContext?.tenantId ?? null;

export const listTransactions = asyncHandler(async (req, res) => {
  const query = listTransactionsQuerySchema.parse(req.query ?? {});
  const result = await transactionService.listTransactions({
    actor: req.user,
    requestedTenantId: resolveRequestedTenantId(req),
    query,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Transactions fetched' });
});

export const getTransaction = asyncHandler(async (req, res) => {
  const transaction = await transactionService.getTransaction({
    id: req.params.id,
    actor: req.user,
    requestedTenantId: resolveRequestedTenantId(req),
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { transaction }, message: 'Transaction fetched' });
});
