'use strict';

const { execSync } = require('child_process');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET_ROOT = '/var/lib/docker/volumes/imsweb-minio_minio-data/_data/imsweb-media-local';
const DRY_RUN = process.argv.includes('--dry-run');

// Get all part.1 files via wsl
console.error('Scanning MinIO volume...');
const stdout = execSync('wsl find ' + BUCKET_ROOT + ' -name part.1 -type f', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const files = stdout.trim().split('\n').filter(Boolean);
console.error('Found', files.length, 'part.1 files');

if (DRY_RUN || !process.argv.includes('--apply')) {
  console.error('Dry run. Sample S3 keys:');
  files.slice(0, 10).forEach(f => {
    const rel = f.replace(BUCKET_ROOT + '/', '');
    const key = rel.replace(/\/[0-9a-f-]+\/part\.1$/, '');
    console.log(key);
  });
  console.error('\nAdd --apply to upload');
  process.exit(0);
}

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: 'http://127.0.0.1:9002',
  forcePathStyle: true,
  credentials: { accessKeyId: 'imsweb-local', secretAccessKey: 'imsweb-local-password' }
});

let uploaded = 0, skipped = 0, errors = 0;

(async () => {
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const rel = filePath.replace(BUCKET_ROOT + '/', '');
    const key = rel.replace(/\/[0-9a-f-]+\/part\.1$/, '');

    process.stderr.write('\r[' + (i + 1) + '/' + files.length + '] ' + key.substring(0, 60).padEnd(60));

    try {
      // Check if already exists
      try {
        await s3.send(new HeadObjectCommand({ Bucket: 'imsweb-media-local', Key: key }));
        skipped++;
        continue;
      } catch { /* not found, upload */ }

      // Read file via wsl and upload
      const data = execSync('wsl cat "' + filePath + '"', { maxBuffer: 50 * 1024 * 1024 });
      await s3.send(new PutObjectCommand({ Bucket: 'imsweb-media-local', Key: key, Body: data }));
      uploaded++;
    } catch (e) {
      errors++;
      console.error('\n  Error:', key, e.message.substring(0, 80));
    }
  }
  console.error('\nDone. Uploaded:', uploaded, 'Skipped:', skipped, 'Errors:', errors);
})();
