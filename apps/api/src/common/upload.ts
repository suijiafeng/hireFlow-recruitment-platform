import { UnsupportedMediaTypeException } from '@nestjs/common';
import type { Request } from 'express';

type MulterFileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => void;

/** 简历原件：PDF/Word/纯文本/常见图片（扫描件） */
export const RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** 入职材料（身份证/银行卡/学历证书，拍照或扫描件） */
export const ONBOARDING_DOCUMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * Multer fileFilter：按白名单校验 mimetype，拒绝时返回 415。
 * 预签名预览链接固定走 inline 展示（storage.service.ts presignedGetUrl），
 * 未做类型限制时 html/svg 等可执行内容会被当作网页渲染——白名单在写入前堵住这类载荷。
 */
export function fileTypeFilter(allowedMimeTypes: string[]): MulterFileFilter {
  return (_req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      callback(new UnsupportedMediaTypeException(`不支持的文件类型：${file.mimetype}`), false);
      return;
    }
    callback(null, true);
  };
}
