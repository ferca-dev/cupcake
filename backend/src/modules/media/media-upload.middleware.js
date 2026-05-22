import multer from 'multer';

import { loadEnv } from '../../config/env.js';
import { ValidationError } from '../../common/errors/index.js';

const createUploader = () => {
  const env = loadEnv();
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: env.MAX_IMAGE_UPLOAD_BYTES,
      files: 1,
    },
  }).single('image');
};

export const parseImageUpload = (req, res, next) => {
  createUploader()(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new ValidationError('Image is too large', [
            { path: ['image'], message: 'Image exceeds the configured upload size limit' },
          ]),
        );
      }
      return next(
        new ValidationError('Invalid image upload', [
          { path: ['image'], message: err.message, code: err.code },
        ]),
      );
    }

    return next(err);
  });
};
