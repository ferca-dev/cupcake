import { Router } from 'express';

import * as contactController from './contact.controller.js';
import { parseContactImportUpload } from './contact-import-upload.middleware.js';
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
  '/imports',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  parseContactImportUpload,
  contactController.createContactImport,
);

contactsRouter.get(
  '/imports/:id',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.getContactImport,
);

contactsRouter.post(
  '/imports/:id/preview',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.previewContactImport,
);

contactsRouter.put(
  '/imports/:id/mapping',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.updateContactImportMapping,
);

contactsRouter.post(
  '/imports/:id/confirm',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.confirmContactImport,
);

contactsRouter.get(
  '/imports/:id/errors',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.downloadContactImportErrors,
);

contactsRouter.get(
  '/export',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.exportContacts,
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

contactsRouter.patch(
  '/:id/consent',
  requirePermission(PERMISSIONS.CONTACTS_MANAGE),
  contactController.updateContactConsent,
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
