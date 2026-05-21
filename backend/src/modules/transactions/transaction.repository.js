import { Transaction } from './transaction.model.js';

const tenantFilter = (filter = {}, tenantId = null) =>
  tenantId ? { ...filter, tenantId } : filter;

export const findTransactions = async ({
  tenantId,
  status,
  type,
  provider,
  page = 1,
  limit = 25,
  sort = '-createdAt',
} = {}) => {
  const filter = tenantFilter({}, tenantId);
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (provider) filter.provider = provider;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Transaction.find(filter).sort(sort).skip(skip).limit(limit),
    Transaction.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const findTransactionById = async ({ id, tenantId = null }) =>
  Transaction.findOne(tenantFilter({ _id: id }, tenantId));

export const createTransaction = async (payload) => Transaction.create(payload);
