import { MediaAsset } from './media-asset.model.js';

export const createAsset = (payload) => MediaAsset.create(payload);

export const findAssetById = ({ id, tenantId, includeDeleted = false }) => {
  const filter = { _id: id, tenantId };
  if (!includeDeleted) filter.status = 'active';
  return MediaAsset.findOne(filter);
};

export const listAssets = async ({
  tenantId,
  page = 1,
  limit = 20,
  purpose,
  status = 'active',
  sort = '-createdAt',
}) => {
  const filter = { tenantId };
  if (purpose) filter.purpose = purpose;
  if (status) filter.status = status;

  const sortSpec = sort.startsWith('-') ? { [sort.slice(1)]: -1 } : { [sort]: 1 };
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    MediaAsset.find(filter).sort(sortSpec).skip(skip).limit(limit),
    MediaAsset.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

export const saveAsset = (asset) => asset.save();

export const findDeletedBefore = ({ before, limit = 100 }) =>
  MediaAsset.find({
    status: 'deleted',
    deletedAt: { $lte: before },
  })
    .sort({ deletedAt: 1 })
    .limit(limit);

export const removeAssetDocument = (asset) => asset.deleteOne();
