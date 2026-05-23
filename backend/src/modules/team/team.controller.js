import * as service from './team.service.js';
import {
  listMembersQuerySchema,
  updateMemberRoleSchema,
  updateMemberStatusSchema,
  createInvitationSchema,
  listInvitationsQuerySchema,
  acceptInvitationSchema,
  ownerTransferSchema,
} from './team.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

export const listMembers = asyncHandler(async (req, res) => {
  const query = listMembersQuerySchema.parse(req.query ?? {});
  const result = await service.listMembers({ actor: req.user, query });
  return sendSuccess(res, { data: result, message: 'Team members fetched' });
});

export const getMember = asyncHandler(async (req, res) => {
  const member = await service.getMember({ actor: req.user, id: req.params.id });
  return sendSuccess(res, { data: { member }, message: 'Team member fetched' });
});

export const updateMemberRole = asyncHandler(async (req, res) => {
  const payload = updateMemberRoleSchema.parse(req.body ?? {});
  const result = await service.updateMemberRole({
    actor: req.user,
    id: req.params.id,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Team member role updated' });
});

export const updateMemberStatus = asyncHandler(async (req, res) => {
  const payload = updateMemberStatusSchema.parse(req.body ?? {});
  const result = await service.updateMemberStatus({
    actor: req.user,
    id: req.params.id,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Team member status updated' });
});

export const removeMember = asyncHandler(async (req, res) => {
  const result = await service.removeMember({
    actor: req.user,
    id: req.params.id,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Team member removed' });
});

export const listInvitations = asyncHandler(async (req, res) => {
  const query = listInvitationsQuerySchema.parse(req.query ?? {});
  const result = await service.listInvitations({ actor: req.user, query });
  return sendSuccess(res, { data: result, message: 'Invitations fetched' });
});

export const createInvitation = asyncHandler(async (req, res) => {
  const payload = createInvitationSchema.parse(req.body ?? {});
  const result = await service.createInvitation({
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: result,
    message: 'Invitation created',
  });
});

export const resendInvitation = asyncHandler(async (req, res) => {
  const result = await service.resendInvitation({
    actor: req.user,
    id: req.params.id,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Invitation resent' });
});

export const revokeInvitation = asyncHandler(async (req, res) => {
  const result = await service.revokeInvitation({
    actor: req.user,
    id: req.params.id,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Invitation revoked' });
});

/**
 * Public acceptance endpoint. The plaintext invitation token is the only
 * credential proving the caller controls the invited email; no bearer token
 * is required here. Rate limiting is applied at the router level.
 */
export const acceptInvitation = asyncHandler(async (req, res) => {
  const payload = acceptInvitationSchema.parse(req.body ?? {});
  const result = await service.acceptInvitation({ payload, ...requestContext(req) });
  return sendSuccess(res, { data: result, message: 'Invitation accepted' });
});

export const transferOwnership = asyncHandler(async (req, res) => {
  const payload = ownerTransferSchema.parse(req.body ?? {});
  const result = await service.transferOwnership({
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Ownership transferred' });
});
