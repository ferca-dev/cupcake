import mongoose from 'mongoose';

import { Tenant } from './tenant.model.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Lists tenants with pagination and basic filtering. Used by the admin panel —
 * tenant isolation does not apply here because the caller is a super admin.
 * `mongoose.trusted` is required because the global `sanitizeFilter` strips
 * raw `$` operators from filter objects unless the caller declares them safe.
 */
export const findTenants = async ({
  page = 1,
  limit = 25,
  status,
  search,
  sort = '-createdAt',
} = {}) => {
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    const escaped = escapeRegex(search);
    filter.$or = [
      { name: mongoose.trusted({ $regex: escaped, $options: 'i' }) },
      { slug: mongoose.trusted({ $regex: escaped, $options: 'i' }) },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Tenant.find(filter).sort(sort).skip(skip).limit(limit),
    Tenant.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const findTenantById = (id) => Tenant.findById(id);
export const findTenantBySlug = (slug) => Tenant.findOne({ slug });
export const slugExists = async (slug) => Boolean(await Tenant.exists({ slug }));
export const createTenant = (payload) => Tenant.create(payload);
