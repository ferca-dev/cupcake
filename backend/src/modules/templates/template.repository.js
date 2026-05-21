import { Template } from './template.model.js';

/**
 * Returns the filter that lets a tenant-bound caller see active system
 * templates plus their own templates (active or otherwise — visibility for
 * tenant templates is controlled by `status` separately at the service layer).
 */
export const tenantVisibilityFilter = (tenantId) => ({
  $or: [{ tenantId: null, status: 'active' }, { tenantId }],
});

export const findTemplates = async ({
  tenantId,
  isSuperAdmin = false,
  status,
  category,
  search,
  scope = 'all',
  page = 1,
  limit = 50,
} = {}) => {
  const filter = {};

  if (isSuperAdmin) {
    // Super admins can browse every template, optionally scoped to a tenant
    // when impersonating, or filtered down to system/tenant slices.
    if (tenantId) filter.tenantId = tenantId;
    if (scope === 'system') filter.tenantId = null;
    if (scope === 'tenant' && tenantId) filter.tenantId = tenantId;
  } else {
    if (scope === 'system') {
      filter.tenantId = null;
      filter.status = 'active';
    } else if (scope === 'tenant') {
      filter.tenantId = tenantId;
    } else {
      Object.assign(filter, tenantVisibilityFilter(tenantId));
    }
  }

  if (status) filter.status = status;
  if (category) filter.category = category;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.title = { $regex: escaped, $options: 'i' };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Template.find(filter).sort({ isSystemTemplate: -1, updatedAt: -1 }).skip(skip).limit(limit),
    Template.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const findTemplateById = async ({ id }) => Template.findById(id);

export const createTemplate = async (payload) => Template.create(payload);

export const updateTemplate = async (template, updates) => {
  Object.assign(template, updates);
  await template.save();
  return template;
};

export const deleteTemplate = async (template) => template.deleteOne();
