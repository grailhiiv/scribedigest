import 'server-only';
import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream } from 'node:fs';

function config() {
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) throw new Error('R2 storage is not configured.');
  const url = new URL(R2_ENDPOINT);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid R2 endpoint.');
  return { bucket: R2_BUCKET, client: new S3Client({ region: 'auto', endpoint: url.origin, forcePathStyle: true, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } }) };
}
export function storageDriver(): 'local' | 'r2' {
  const driver = process.env.STORAGE_DRIVER || 'local';
  if (driver !== 'local' && driver !== 'r2') throw new Error('Invalid storage driver.');
  if (driver === 'r2') config();
  return driver;
}
const key = (id: string, filename = 'document.pdf') => `books/${id}/${filename}`;
export async function putPdf(id: string, file: string, filename?: string) {
  const { bucket, client } = config();
  await new Upload({ client, params: { Bucket: bucket, Key: key(id, filename), Body: createReadStream(file), ContentType: 'application/pdf' }, partSize: 8 * 1024 * 1024, queueSize: 2, leavePartsOnError: false }).done();
}
export async function getPdf(id: string, range?: string, filename?: string) {
  const { bucket, client } = config();
  return client.send(new GetObjectCommand({ Bucket: bucket, Key: key(id, filename), Range: range }));
}
export async function deletePdf(id: string, filename?: string) {
  const { bucket, client } = config();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key(id, filename) }));
}
