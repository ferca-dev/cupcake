import * as contactService from './contact.service.js';
import {
  createContactSchema,
  updateContactSchema,
  updateContactConsentSchema,
  listContactsQuerySchema,
  createContactGroupSchema,
  updateContactGroupSchema,
  listContactGroupsQuerySchema,
  contactImportMappingSchema,
  contactExportQuerySchema,
} from './contact.validation.js';
import * as contactImportService from './contact-import.service.js';
import * as contactExportService from './contact-export.service.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const resolveTenantId = (req) => req.tenantContext?.tenantId ?? null;

export const listContacts = asyncHandler(async (req, res) => {
  const query = listContactsQuerySchema.parse(req.query ?? {});
  const tenantId = resolveTenantId(req);
  const result = await contactService.listContacts({ tenantId, ...query });
  return sendSuccess(res, { data: result, message: 'Contacts fetched' });
});

export const getContact = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const contact = await contactService.getContact({ id: req.params.id, tenantId });
  return sendSuccess(res, { data: { contact }, message: 'Contact fetched' });
});

export const createContact = asyncHandler(async (req, res) => {
  const payload = createContactSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const contact = await contactService.createContact({
    tenantId,
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { contact },
    message: 'Contact created',
  });
});

export const updateContact = asyncHandler(async (req, res) => {
  const payload = updateContactSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const contact = await contactService.updateContact({
    id: req.params.id,
    tenantId,
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { contact }, message: 'Contact updated' });
});

export const updateContactConsent = asyncHandler(async (req, res) => {
  const payload = updateContactConsentSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const contact = await contactService.updateContactConsent({
    id: req.params.id,
    tenantId,
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { contact }, message: 'Contact consent updated' });
});

export const deleteContact = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const hard = String(req.query?.hard ?? '').toLowerCase() === 'true';
  const result = await contactService.deleteContact({
    id: req.params.id,
    tenantId,
    actor: req.user,
    hard,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    data: result,
    message: hard ? 'Contact deleted' : 'Contact archived',
  });
});

export const createContactImport = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const job = await contactImportService.createContactImport({
    tenantId,
    actor: req.user,
    file: req.file,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { job },
    message: 'Contact import uploaded',
  });
});

export const getContactImport = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const job = await contactImportService.getContactImport({
    id: req.params.id,
    tenantId,
  });
  return sendSuccess(res, {
    data: { job },
    message: 'Contact import fetched',
  });
});

export const previewContactImport = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const job = await contactImportService.previewContactImport({
    id: req.params.id,
    tenantId,
  });
  return sendSuccess(res, { data: { job }, message: 'Contact import preview fetched' });
});

export const updateContactImportMapping = asyncHandler(async (req, res) => {
  const payload = contactImportMappingSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const job = await contactImportService.updateContactImportMapping({
    id: req.params.id,
    tenantId,
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { job }, message: 'Contact import mapping saved' });
});

export const confirmContactImport = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const job = await contactImportService.confirmContactImport({
    id: req.params.id,
    tenantId,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.ACCEPTED,
    data: { job },
    message: 'Contact import processed',
  });
});

export const downloadContactImportErrors = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const report = await contactImportService.buildContactImportErrorReport({
    id: req.params.id,
    tenantId,
  });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${report.filename}"`);
  res.set('Cache-Control', 'no-store');
  return res.status(200).send(report.body);
});

export const exportContacts = asyncHandler(async (req, res) => {
  const query = contactExportQuerySchema.parse(req.query ?? {});
  const tenantId = resolveTenantId(req);
  const exported = await contactExportService.buildContactExport({ tenantId, query });
  const contentType =
    exported.format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv; charset=utf-8';
  res.set('Content-Type', contentType);
  res.set('Content-Disposition', `attachment; filename="${exported.filename}"`);
  res.set('Cache-Control', 'no-store');
  return res.status(200).send(exported.body);
});

// --- Groups ----------------------------------------------------------------

export const listContactGroups = asyncHandler(async (req, res) => {
  const query = listContactGroupsQuerySchema.parse(req.query ?? {});
  const tenantId = resolveTenantId(req);
  const result = await contactService.listContactGroups({ tenantId, ...query });
  return sendSuccess(res, { data: result, message: 'Contact groups fetched' });
});

export const getContactGroup = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const group = await contactService.getContactGroup({
    id: req.params.id,
    tenantId,
  });
  return sendSuccess(res, { data: { group }, message: 'Contact group fetched' });
});

export const createContactGroup = asyncHandler(async (req, res) => {
  const payload = createContactGroupSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const group = await contactService.createContactGroup({
    tenantId,
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { group },
    message: 'Contact group created',
  });
});

export const updateContactGroup = asyncHandler(async (req, res) => {
  const payload = updateContactGroupSchema.parse(req.body ?? {});
  const tenantId = resolveTenantId(req);
  const group = await contactService.updateContactGroup({
    id: req.params.id,
    tenantId,
    actor: req.user,
    payload,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { group }, message: 'Contact group updated' });
});

export const deleteContactGroup = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const result = await contactService.deleteContactGroup({
    id: req.params.id,
    tenantId,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Contact group deleted' });
});

export const addContactToGroup = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const contactId = req.body?.contactId ?? req.params.contactId;
  const result = await contactService.addContactToGroup({
    groupId: req.params.id,
    contactId,
    tenantId,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Contact added to group' });
});

export const removeContactFromGroup = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const result = await contactService.removeContactFromGroup({
    groupId: req.params.id,
    contactId: req.params.contactId,
    tenantId,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Contact removed from group' });
});
