import multer from 'multer';

import { ValidationError } from '../../common/errors/index.js';

export const MAX_CONTACT_IMPORT_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CONTACT_IMPORT_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const originalName = file.originalname?.toLowerCase() ?? '';
    const hasAllowedExtension = originalName.endsWith('.csv') || originalName.endsWith('.xlsx');
    if (ALLOWED_MIME_TYPES.has(file.mimetype) || hasAllowedExtension) {
      cb(null, true);
      return;
    }
    cb(
      new ValidationError('Unsupported import file type', [
        { path: ['file'], message: 'Upload a CSV or XLSX file' },
      ]),
    );
  },
}).single('file');

export const parseContactImportUpload = (req, res, next) => {
  uploader(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new ValidationError('Contact import file is too large', [
            { path: ['file'], message: 'Contact imports must be 10 MB or smaller' },
          ]),
        );
      }
      return next(
        new ValidationError('Invalid contact import upload', [
          { path: ['file'], message: err.message, code: err.code },
        ]),
      );
    }
    return next(err);
  });
};
