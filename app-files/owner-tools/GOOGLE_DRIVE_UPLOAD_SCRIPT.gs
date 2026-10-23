/* Ethereal Drum + Ethereal Handpan Community submission receiver.
 * One script serves both apps, each with its own review folder:
 *   tongue drum songs (.drumsong) -> the folder below (SUBMISSION_FOLDER_ID),
 *     e.g. "Tonguedrum Community Submissions" (renaming it is fine, the ID stays);
 *   handpan songs (.handsong) -> "Handpan Community Submissions", created
 *     automatically next to it on the first handpan submission.
 * Paste this entire file into a new Google Apps Script project.
 * The review-folder ID is already configured below.
 * After editing an existing web app, deploy a new version from
 * Deploy > Manage deployments > Edit > New version.
 */

const SUBMISSION_FOLDER_ID = '1zW2BAsbo6P_U6hUoVlvdSW3PvHsI3bBQ';
const HANDPAN_FOLDER_NAME = 'Handpan Community Submissions';
const MAX_SONG_BYTES = 60000;
const UPLOAD_STATUS_SECONDS = 600;
const STATUS_CALLBACK = 'etherealCommunityUploadStatus';
const DUPLICATE_GUARD_SECONDS = 21600; // 6 hours (Apps Script cache maximum).

function doGet(event) {
  const parameters = event && event.parameter ? event.parameter : {};
  const nonce = safeNonce_(parameters.nonce);
  if (nonce && String(parameters.callback || '') === STATUS_CALLBACK) {
    const cached = CacheService.getScriptCache().get(`community-upload:${nonce}`);
    const status = cached
      ? JSON.parse(cached)
      : { nonce: nonce, pending: true };
    const javascript = `${STATUS_CALLBACK}(${safeInlineJson_(status)});`;
    return ContentService.createTextOutput(javascript)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return HtmlService.createHtmlOutput('Ethereal Drum / Ethereal Handpan Community Upload is ready.');
}

function doPost(event) {
  const parameters = event && event.parameter ? event.parameter : {};
  const nonce = safeNonce_(parameters.nonce);

  try {
    if (String(parameters.website || '')) throw new Error('Rejected');
    if (SUBMISSION_FOLDER_ID === 'PASTE_GOOGLE_DRIVE_FOLDER_ID_HERE') {
      throw new Error('The Drive folder is not configured');
    }

    const source = String(parameters.payload || '');
    if (!source || source.length > MAX_SONG_BYTES) throw new Error('Invalid size');
    const document = JSON.parse(source);
    validateSongDocument_(document);

    const fingerprint = songFingerprint_(document);
    const duplicateKey = `community-song:${fingerprint}`;
    const cache = CacheService.getScriptCache();
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      if (cache.get(duplicateKey)) {
        const message = 'This song version is already under review.';
        saveUploadStatus_(nonce, { nonce: nonce, ok: true, duplicate: true, message: message });
        return replyToTrainer_(nonce, true, message);
      }

      const handpan = document.format === 'ethereal-handpan-song-v1';
      const folder = handpan ? handpanFolder_() : DriveApp.getFolderById(SUBMISSION_FOLDER_ID);
      const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
      const unique = Utilities.getUuid().slice(0, 8);
      const filename = `${safeFilename_(document.song.title)}-${timestamp}-${unique}.${handpan ? 'handsong' : 'drumsong'}`;
      folder.createFile(filename, JSON.stringify(document, null, 2), MimeType.PLAIN_TEXT);
      cache.put(duplicateKey, '1', DUPLICATE_GUARD_SECONDS);
    } finally {
      lock.releaseLock();
    }

    saveUploadStatus_(nonce, { nonce: nonce, ok: true, message: 'Song submitted for review.' });
    return replyToTrainer_(nonce, true, 'Song submitted for review.');
  } catch (error) {
    console.error(error);
    saveUploadStatus_(nonce, { nonce: nonce, ok: false, message: 'The song could not be submitted. Please try again later.' });
    return replyToTrainer_(nonce, false, 'The song could not be submitted. Please try again later.');
  }
}

// The handpan review folder sits next to the tongue drum one. It is found by name (or
// created) once, then remembered by its ID, so renaming or moving it later is fine.
function handpanFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty('HANDPAN_FOLDER_ID');
  if (savedId) {
    try {
      const saved = DriveApp.getFolderById(savedId);
      if (!saved.isTrashed()) return saved;
    } catch (error) {
      // The folder was deleted; find or create it again below.
    }
  }
  const drumFolder = DriveApp.getFolderById(SUBMISSION_FOLDER_ID);
  const parents = drumFolder.getParents();
  const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const existing = parent.getFoldersByName(HANDPAN_FOLDER_NAME);
  const folder = existing.hasNext() ? existing.next() : parent.createFolder(HANDPAN_FOLDER_NAME);
  properties.setProperty('HANDPAN_FOLDER_ID', folder.getId());
  return folder;
}

function safeNonce_(value) {
  const nonce = String(value || '').slice(0, 120);
  return /^[a-zA-Z0-9-]{8,120}$/.test(nonce) ? nonce : '';
}

function saveUploadStatus_(nonce, status) {
  if (!nonce) return;
  CacheService.getScriptCache().put(
    `community-upload:${nonce}`,
    JSON.stringify(status),
    UPLOAD_STATUS_SECONDS
  );
}

function validateSongDocument_(document) {
  if (document && document.format === 'ethereal-handpan-song-v1') {
    validateHandpanSong_(document);
    return;
  }
  if (!document || document.format !== 'ethereal-drum-song-v3') throw new Error('Invalid format');
  const song = document.song;
  if (!song || typeof song !== 'object') throw new Error('Missing song');

  const title = String(song.title || '').trim();
  const sequence = String(song.sequence || '').trim();
  const bpm = Number(song.bpm);
  const allowedScales = ['major', 'major-pentatonic', 'minor-pentatonic', 'any'];

  if (!title || title.length > 120) throw new Error('Invalid title');
  if (!sequence || sequence.length > 50000) throw new Error('Invalid sequence');
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 240) throw new Error('Invalid tempo');
  if (!allowedScales.includes(String(song.scaleType || 'any'))) throw new Error('Invalid scale');

  document.song = {
    title: title,
    bpm: bpm,
    sequence: sequence,
    scaleType: String(song.scaleType || 'any'),
    folder: 'community'
  };
}

function validateHandpanSong_(document) {
  const song = document.song;
  if (!song || typeof song !== 'object') throw new Error('Missing song');
  const title = String(song.title || '').trim();
  const sequence = String(song.sequence || '').trim();
  const bpm = Number(song.bpm);
  const beatsPerBar = Math.round(Number(song.beatsPerBar) || 4);
  if (!title || title.length > 120) throw new Error('Invalid title');
  if (!sequence || sequence.length > 50000) throw new Error('Invalid sequence');
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 260) throw new Error('Invalid tempo');
  if (beatsPerBar < 1 || beatsPerBar > 12) throw new Error('Invalid beats');
  document.song = {
    title: title,
    artist: String(song.artist || '').trim().slice(0, 80),
    bpm: bpm,
    beatsPerBar: beatsPerBar,
    scale: String(song.scale || 'D Kurd').slice(0, 40),
    sequence: sequence,
    folder: 'community'
  };
}

function songFingerprint_(document) {
  const song = document.song || {};
  const canonical = [
    String(document.format || ''),
    String(song.title || '').trim(),
    String(Number(song.bpm) || ''),
    String(song.sequence || '').trim(),
    String(song.scaleType || 'any')
  ].join('\u001f');
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    canonical,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 32);
}

function safeFilename_(value) {
  const cleaned = String(value || 'community-song')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return cleaned || 'community-song';
}

function replyToTrainer_(nonce, ok, message) {
  const response = safeInlineJson_({
    type: 'ethereal-community-upload',
    nonce: nonce,
    ok: Boolean(ok),
    message: String(message)
  });

  const html = `<!doctype html><html><body><script>try{window.top.postMessage(${response}, '*');}catch(error){}try{window.parent.postMessage(${response}, '*');}catch(error){}<\/script></body></html>`;
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function safeInlineJson_(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
