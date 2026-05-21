import mongoose from 'mongoose';

import { Contact } from './contact.model.js';
import { ContactGroup } from './contact-group.model.js';

/**
 * Scopes a Mongo filter to the supplied tenant. `tenantId` may be `null` for
 * super-admin global lookups; callers that should *never* allow that case
 * must enforce it before delegating here.
 */
export const tenantFilter = (filter = {}, tenantId = null) =>
  tenantId ? { ...filter, tenantId } : filter;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const findContacts = async ({
  tenantId,
  status,
  search,
  email,
  phone,
  whatsappPhone,
  tag,
  groupId,
  channel,
  page = 1,
  limit = 20,
  sort = '-updatedAt',
} = {}) => {
  const filter = tenantFilter({}, tenantId);
  if (status) filter.status = status;
  if (groupId) filter.groupIds = groupId;
  if (tag) filter.tags = tag;
  if (email) filter.email = email.toLowerCase();
  if (phone) filter.phone = phone;
  if (whatsappPhone) filter.whatsappPhone = whatsappPhone;
  if (channel === 'email') filter.email = filter.email ?? mongoose.trusted({ $nin: [null, ''] });
  if (channel === 'phone') filter.phone = filter.phone ?? mongoose.trusted({ $nin: [null, ''] });
  if (channel === 'whatsapp')
    filter.whatsappPhone = filter.whatsappPhone ?? mongoose.trusted({ $nin: [null, ''] });

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { fullName: rx },
      { firstName: rx },
      { lastName: rx },
      { email: rx },
      { phone: rx },
      { whatsappPhone: rx },
      { tags: rx },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Contact.find(filter).sort(sort).skip(skip).limit(limit),
    Contact.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const findContactById = async ({ id, tenantId = null }) =>
  Contact.findOne(tenantFilter({ _id: id }, tenantId));

export const findContactsByIds = async ({ ids, tenantId = null }) =>
  Contact.find(tenantFilter({ _id: mongoose.trusted({ $in: ids }) }, tenantId));

export const createContact = async (payload) => Contact.create(payload);

export const updateContact = async (contact, updates) => {
  Object.assign(contact, updates);
  await contact.save();
  return contact;
};

export const removeContact = async (contact) => contact.deleteOne();

export const countContactsInGroup = async ({ groupId, tenantId }) =>
  Contact.countDocuments(tenantFilter({ groupIds: groupId }, tenantId));

export const pullGroupFromAllContacts = async ({ groupId, tenantId }) =>
  Contact.updateMany(tenantFilter({ groupIds: groupId }, tenantId), {
    $pull: { groupIds: groupId },
  });

export const findContactGroups = async ({
  tenantId,
  status,
  search,
  page = 1,
  limit = 50,
  sort = 'name',
} = {}) => {
  const filter = tenantFilter({}, tenantId);
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { description: rx }];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ContactGroup.find(filter).sort(sort).skip(skip).limit(limit),
    ContactGroup.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const findContactGroupById = async ({ id, tenantId = null }) =>
  ContactGroup.findOne(tenantFilter({ _id: id }, tenantId));

export const findContactGroupsByIds = async ({ ids, tenantId = null }) =>
  ContactGroup.find(tenantFilter({ _id: mongoose.trusted({ $in: ids }) }, tenantId));

export const findContactGroupByName = async ({ name, tenantId, excludeId = null }) => {
  const filter = tenantFilter({ name }, tenantId);
  if (excludeId) filter._id = mongoose.trusted({ $ne: excludeId });
  return ContactGroup.findOne(filter);
};

export const createContactGroup = async (payload) => ContactGroup.create(payload);

export const updateContactGroup = async (group, updates) => {
  Object.assign(group, updates);
  await group.save();
  return group;
};

export const removeContactGroup = async (group) => group.deleteOne();

export const countContactsByGroupIds = async ({ groupIds, tenantId }) => {
  if (!groupIds.length) return new Map();
  const rows = await Contact.aggregate([
    { $match: tenantFilter({ groupIds: mongoose.trusted({ $in: groupIds }) }, tenantId) },
    { $unwind: '$groupIds' },
    { $match: { groupIds: mongoose.trusted({ $in: groupIds }) } },
    { $group: { _id: '$groupIds', count: { $sum: 1 } } },
  ]);
  const counts = new Map();
  for (const row of rows) {
    counts.set(row._id.toString(), row.count);
  }
  return counts;
};
