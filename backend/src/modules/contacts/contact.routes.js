import { Router } from 'express';

import * as contactController from './contact.controller.js';
import { authenticate } from '../../common/middlewares/authenticate.js';
import { requirePermission, requireTenantContext } from '../../common/middlewares/authorize.js';
import { PERMISSIONS } from '../../common/auth/roles.js';

export const contactsRouter = Router();

contactsRouter.use(authenticate);
contactsRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));

contactsRouter.get(
  '/',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.listContacts,
);

contactsRouter.post(
  '/',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.createContact,
);

contactsRouter.post(
  '/import',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.requestContactImport,
);

contactsRouter.get(
  '/imports/:id/report',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.getContactImportReport,
);

contactsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.getContact,
);

contactsRouter.put(
  '/:id',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.updateContact,
);

contactsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.deleteContact,
);

export const contactGroupsRouter = Router();

contactGroupsRouter.use(authenticate);
contactGroupsRouter.use(requireTenantContext({ allowSuperAdminGlobal: false }));

contactGroupsRouter.get(
  '/',
  requirePermission(PERMISSIONS.GROUPS_MANAGE),
  contactController.listContactGroups,
);

contactGroupsRouter.post(
  '/',
  requirePermission(PERMISSIONS.GROUPS_MANAGE),
  contactController.createContactGroup,
);

contactGroupsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.GROUPS_MANAGE),
  contactController.getContactGroup,
);

contactGroupsRouter.put(
  '/:id',
  requirePermission(PERMISSIONS.GROUPS_MANAGE),
  contactController.updateContactGroup,
);

contactGroupsRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.GROUPS_MANAGE),
  contactController.deleteContactGroup,
);

contactGroupsRouter.post(
  '/:id/contacts',
  requirePermission(PERMISSIONS.GROUPS_MANAGE),
  contactController.addContactToGroup,
);

contactGroupsRouter.delete(
  '/:id/contacts/:contactId',
  requirePermission(PERMISSIONS.GROUPS_MANAGE),
  contactController.removeContactFromGroup,
);
