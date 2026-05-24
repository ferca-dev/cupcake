import mongoose from 'mongoose';

import { CustomDomain } from './custom-domain.model.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createDomain = (payload) => CustomDomain.create(payload);

export const findDomainById = ({ id, tenantId = null, includeDeleted = false }) => {
  const filter = { _id: id };
  if (tenantId) filter.tenantId = tenantId;
  if (!includeDeleted) filter.deletedAt = null;
  return CustomDomain.findOne(filter);
};

export const findDomainByHostname = ({ hostname, includeDeleted = false }) => {
  const filter = { hostname };
  if (!includeDeleted) filter.deletedAt = null;
  return CustomDomain.findOne(filter);
};

export const findActiveDomainByHostname = ({ hostname }) =>
  CustomDomain.findOne({ hostname, status: 'active', deletedAt: null });

export const listTenantDomains = async ({
  tenantId,
  page = 1,
  limit = 25,
  status,
  sort = '-createdAt',
} = {}) => {
  const filter = { tenantId, deletedAt: null };
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    CustomDomain.find(filter).sort(sort).skip(skip).limit(limit),
    CustomDomain.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const listAllDomains = async ({
  page = 1,
  limit = 25,
  status,
  tenantId,
  search,
  sort = '-createdAt',
} = {}) => {
  const filter = { deletedAt: null };
  if (status) filter.status = status;
  if (tenantId) filter.tenantId = tenantId;
  if (search) {
    filter.hostname = mongoose.trusted({ $regex: escapeRegex(search), $options: 'i' });
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    CustomDomain.find(filter).sort(sort).skip(skip).limit(limit),
    CustomDomain.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const saveDomain = (domain) => domain.save();
