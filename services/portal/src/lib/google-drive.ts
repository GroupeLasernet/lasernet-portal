// ============================================================
// lib/google-drive.ts
// ------------------------------------------------------------
// Thin helper around the Google Drive v3 API using a Service
// Account. Used by /api/files/documents/* to upload, rename,
// delete, and stream files from a Workspace Shared Drive.
//
// Env vars (both required on the portal deploy):
//   GOOGLE_SERVICE_ACCOUNT_KEY — the full JSON service-account
//     key, pasted as a single-line string (or JSON).
//   GOOGLE_DRIVE_FOLDER_ID     — the Shared-Drive folder ID
//     that uploads should land in. The service account must be
//     a member of that Shared Drive with Content Manager role.
//
// All Drive calls are made with `supportsAllDrives: true` so
// they work inside Shared Drives (not just "My Drive").
// ============================================================

import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import { Readable } from 'stream';

let cachedDrive: drive_v3.Drive | null = null;

function getServiceAccountCredentials(): Record<string, any> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON');
  }
}

export function getDriveFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!id) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set');
  return id;
}

export function driveClient(): drive_v3.Drive {
  if (cachedDrive) return cachedDrive;
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  cachedDrive = google.drive({ version: 'v3', auth });
  return cachedDrive;
}

export interface UploadArgs {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface UploadedFileMeta {
  driveFileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export async function uploadToDrive({ filename, mimeType, buffer }: UploadArgs): Promise<UploadedFileMeta> {
  const drive = driveClient();
  const folderId = getDriveFolderId();
  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
      mimeType,
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id, name, mimeType, size',
    supportsAllDrives: true,
  });
  const f = res.data;
  if (!f.id) throw new Error('Drive upload returned no file ID');
  return {
    driveFileId: f.id,
    name: f.name || filename,
    mimeType: f.mimeType || mimeType,
    sizeBytes: Number(f.size || buffer.length),
  };
}

export async function renameOnDrive(driveFileId: string, newName: string): Promise<void> {
  const drive = driveClient();
  await drive.files.update({
    fileId: driveFileId,
    requestBody: { name: newName },
    supportsAllDrives: true,
  });
}

export async function deleteFromDrive(driveFileId: string): Promise<void> {
  const drive = driveClient();
  await drive.files.delete({
    fileId: driveFileId,
    supportsAllDrives: true,
  });
}

// Streams the file body back as a Node readable stream. The
// /download route pipes this straight to the client, preserving
// the Drive-reported mimeType. Works for any file type that was
// originally uploaded through `uploadToDrive`.
export async function downloadFromDrive(driveFileId: string): Promise<{ stream: NodeJS.ReadableStream; mimeType: string; size: number; name: string; }> {
  const drive = driveClient();
  const meta = await drive.files.get({
    fileId: driveFileId,
    fields: 'name, mimeType, size',
    supportsAllDrives: true,
  });
  const media = await drive.files.get(
    {
      fileId: driveFileId,
      alt: 'media',
      supportsAllDrives: true,
    },
    { responseType: 'stream' },
  );
  return {
    stream: media.data as unknown as NodeJS.ReadableStream,
    mimeType: meta.data.mimeType || 'application/octet-stream',
    size: Number(meta.data.size || 0),
    name: meta.data.name || 'file',
  };
}
