import 'server-only';
import { S3Client, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream } from 'node:fs';

let cachedConfig: { endpoint: string; bucket: string; accessKey: string; secret: string; client: S3Client } | undefined;
function config() {
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) throw new Error('R2 storage is not configured.');
  const url = new URL(R2_ENDPOINT);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid R2 endpoint.');
  if (!cachedConfig || cachedConfig.endpoint !== url.origin || cachedConfig.bucket !== R2_BUCKET || cachedConfig.accessKey !== R2_ACCESS_KEY_ID || cachedConfig.secret !== R2_SECRET_ACCESS_KEY) {
    cachedConfig = { endpoint: url.origin, bucket: R2_BUCKET, accessKey: R2_ACCESS_KEY_ID, secret: R2_SECRET_ACCESS_KEY,
      client: new S3Client({ region: 'auto', endpoint: url.origin, forcePathStyle: true, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } }) };
  }
  return { bucket: cachedConfig.bucket, client: cachedConfig.client };
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
export async function getPdfSize(id: string, filename?: string) {
  const { bucket, client } = config();
  return (await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key(id, filename) }))).ContentLength;
}
export async function pdfExists(id: string, filename: string) {
  try { await getPdfSize(id, filename); return true; }
  catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}
export async function deletePdf(id: string, filename?: string) {
  const { bucket, client } = config();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key(id, filename) }));
}
