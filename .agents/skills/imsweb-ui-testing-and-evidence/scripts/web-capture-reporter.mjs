import fs from 'node:fs';
import { parseJSON } from './native-capture.mjs';

// onTestEnd runs after fixture teardown; an earlier screenshot is never a verdict.
export default class WebCaptureReporter {
  onBegin() { fs.writeFileSync(process.env.IMS_UI_CAPTURE_RESULTS, '', { flag: 'wx' }); }
  onTestEnd(test, result) {
    const id = /^ui-capture:([a-z0-9-]+)/.exec(test.title)?.[1];
    if (!id) return;
    const meta = result.attachments.find(a => a.name === 'ui-capture-meta');
    const metadata = meta ? parseJSON(meta.body || fs.readFileSync(meta.path), 'Playwright capture metadata') : null;
    fs.appendFileSync(process.env.IMS_UI_CAPTURE_RESULTS, JSON.stringify({ id, project: test.parent.project()?.name, status: result.status, retry: result.retry, duration: result.duration, startedAt: result.startTime, metadata, errors: result.errors.map(e => e.message), attachments: result.attachments.filter(a => a.contentType === 'image/png').map(a => ({ name: a.name, path: a.path, ...(a.body ? { body: a.body.toString('base64') } : {}) })) }) + '\n');
  }
  printsToStdio() { return false; }
}
