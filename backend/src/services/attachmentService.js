import fs from 'node:fs';
import path from 'node:path';
import * as repo from '../repositories/ticketRepository.js';
import { PRIVATE_UPLOAD_DIR, removeTemporaryUploads } from '../middleware/fileUploads.js';
import { forbidden, notFound, badRequest } from '../utils/errors.js';
import { ROLES } from '../utils/constants.js';

const expectedMimeByExtension = new Map([
  ['.pdf', 'application/pdf'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.mp4', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'],
]);
const mp4Brands = new Set(['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'MSNV']);

async function detectMimeType(filePath, extension) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const content = buffer.subarray(0, bytesRead);
    const startsWith = (...bytes) => content.subarray(0, bytes.length).equals(Buffer.from(bytes));

    if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
    if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
    if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
    if (content.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/)) return 'image/gif';
    if (content.subarray(0, 4).toString('ascii') === 'RIFF'
      && content.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    if (content.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
      return extension === '.webm' && content.toString('latin1').includes('webm') ? 'video/webm' : null;
    }
    if (content.subarray(4, 8).toString('ascii') === 'ftyp') {
      const brands = [content.subarray(8, 12).toString('ascii')];
      for (let offset = 16; offset + 4 <= bytesRead; offset += 4) {
        brands.push(content.subarray(offset, offset + 4).toString('ascii'));
      }
      if (extension === '.mov' && brands.includes('qt  ')) return 'video/quicktime';
      if (extension === '.mp4' && brands.some((brand) => mp4Brands.has(brand))) return 'video/mp4';
    }
    return null;
  } finally {
    await handle.close();
  }
}

function cleanOriginalName(name) {
  return name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || 'attachment';
}

function shapeAttachment(file) {
  return {
    id: file.id,
    name: file.original_name,
    mimeType: file.mime_type,
    sizeBytes: Number(file.size_bytes),
    createdAt: file.created_at,
  };
}

export async function addTicketAttachments(ticketId, user, files) {
  const savedIds = [];
  try {
    if (!files.length) throw badRequest('Choose at least one file to upload');
    const ticket = await repo.findTicketById(ticketId);
    if (!ticket) throw notFound('Ticket not found');
    if (user.role === ROLES.AUTHOR && ticket.author_user_id !== user.id) {
      throw forbidden('This ticket belongs to another author');
    }

    const validatedFiles = [];
    for (const file of files) {
      const extension = path.extname(file.originalname).toLowerCase();
      const expectedMime = expectedMimeByExtension.get(extension);
      const detectedMime = await detectMimeType(file.path, extension);
      if (!detectedMime || detectedMime !== expectedMime) {
        throw badRequest(`The file content does not match an allowed file type: ${cleanOriginalName(file.originalname)}`);
      }
      validatedFiles.push({ file, mimeType: detectedMime });
    }

    for (const { file, mimeType } of validatedFiles) {
      const id = await repo.insertTicketAttachment({
        ticketId,
        uploadedBy: user.id,
        originalName: cleanOriginalName(file.originalname),
        storageName: path.basename(file.filename),
        mimeType,
        sizeBytes: file.size,
      });
      savedIds.push(id);
    }
    if (validatedFiles.length) {
      await repo.insertTicketEvent({
        ticketId,
        actorUserId: user.id,
        event: 'attachments_uploaded',
        detail: { count: validatedFiles.length },
      });
    }
    return (await repo.listTicketAttachments(ticketId)).map(shapeAttachment);
  } catch (error) {
    await repo.deleteTicketAttachments(savedIds);
    await removeTemporaryUploads(files);
    throw error;
  }
}

export async function listTicketAttachments(ticketId) {
  return (await repo.listTicketAttachments(ticketId)).map(shapeAttachment);
}

export async function getAttachmentForUser(attachmentId, user) {
  const attachment = await repo.findTicketAttachment(attachmentId);
  if (!attachment) throw notFound('Attachment not found');
  if (user.role === ROLES.AUTHOR && attachment.author_user_id !== user.id) {
    throw forbidden('This ticket belongs to another author');
  }
  const filePath = path.resolve(PRIVATE_UPLOAD_DIR, attachment.storage_name);
  if (path.dirname(filePath) !== PRIVATE_UPLOAD_DIR) throw notFound('Attachment not found');
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch (error) {
    if (error.code === 'ENOENT') throw notFound('Attachment file is no longer available');
    throw error;
  }
  return { path: filePath, name: attachment.original_name, mimeType: attachment.mime_type };
}
