import { z } from 'zod';

import { TENANT_INVITABLE_ROLES } from '../../common/auth/roles.js';
import { USER_STATUS_VALUES } from '../users/user.model.js';
import { INVITATION_STATUSES } from './team-invitation.model.js';

const emailField = z.string().trim().toLowerCase().email();
const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const listMembersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    role: z.enum(TENANT_INVITABLE_ROLES).optional(),
    status: z.enum(USER_STATUS_VALUES).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    sort: z
      .enum(['createdAt', '-createdAt', 'name', '-name', 'status', '-status'])
      .optional()
      .default('-createdAt'),
  })
  .strict();

export const updateMemberRoleSchema = z
  .object({
    role: z.enum(TENANT_INVITABLE_ROLES),
  })
  .strict();

// `active` and `inactive` cover the documented member states. We allow
// `suspended` so a future admin tool can pause an account without revoking it.
const MEMBER_STATUS_TRANSITIONS = USER_STATUS_VALUES;

export const updateMemberStatusSchema = z
  .object({
    status: z.enum(MEMBER_STATUS_TRANSITIONS),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const createInvitationSchema = z
  .object({
    email: emailField,
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(TENANT_INVITABLE_ROLES),
  })
  .strict();

export const createSurveyorSchema = z
  .object({
    email: emailField,
    name: z.string().trim().min(1).max(120),
    password: passwordField,
  })
  .strict();

export const listInvitationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.enum(INVITATION_STATUSES).optional(),
    role: z.enum(TENANT_INVITABLE_ROLES).optional(),
    search: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const acceptInvitationSchema = z
  .object({
    token: z.string().trim().min(10).max(256),
    name: z.string().trim().min(1).max(120).optional(),
    password: passwordField,
  })
  .strict();

export const ownerTransferSchema = z
  .object({
    targetUserId: z.string().trim().min(1).max(64),
    confirm: z.literal(true, {
      errorMap: () => ({ message: 'Ownership transfer must be confirmed' }),
    }),
  })
  .strict();
