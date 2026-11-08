const formats = {
  post: ['Instagram Post', 1080, 1080, 'IG'],
  reel: ['Instagram Reel', 1080, 1920, '▶'],
  commerce: ['E-commerce', 1024, 1024, '◇'],
  email: ['Email Header', 600, 800, '✉'],
  pin: ['Pinterest Pin', 1000, 1500, 'P'],
  story: ['Pinterest Story', 1080, 1290, 'P'],
};

const palettes = {
  editorial: ['#170e2e', '#7541c3', '#ded0fd'],
  minimal: ['#13244b', '#457594', '#d7ecf8'],
  bold: ['#201043', '#963aa7', '#ffe2fc'],
};
const duration = 30;
const $ = id => document.getElementById(id);
const form = $('brief');
const format = $('format');
const prompt = $('prompt');
const preview = $('preview-box');
const status = $('status');
const download = $('download');
let reference = null;
let referenceUrl = "";
let readingReference = false;
let uploadVersion = 0;
let currentExportUrl;
let activeJob;

for (const [id, [name, width, height, icon]] of Object.entries(formats)) {
  format.add(new Option(name + ' · ' + width + ' × ' + height, id));
  const card = document.createElement('a');
  card.className = 'format-card';
  card.href = '#studio';
  card.innerHTML = '<span class="format-icon" aria-hidden="true">' + icon
    + '</span><b>' + name + '</b><small>' + width + ' × ' + height + '</small>';
  card.addEventListener('click', () => {
    if (!activeJob) {
      format.value = id;
      updateBrief();
    }
  });
  $('format-grid').append(card);
}

function route() {
  const page = location.hash.slice(1);
  $('home-view').hidden = page === 'studio' || page === 'library';
  $('studio-view').hidden = page !== 'studio';
  $('library-view').hidden = page !== 'library';
  for (const link of document.querySelectorAll('.nav nav a')) {
    if (link.hash === location.hash) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (page === 'library') renderLibrary();
  if (page === 'formats') $('formats').scrollIntoView();
  else window.scrollTo(0, 0);
}

function useTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('theme').textContent = theme === 'dark' ? '☀' : '☾';
  $('theme').setAttribute('aria-pressed', String(theme === 'dark'));
}

try {
  useTheme(localStorage.getItem('purplenova-theme') || 'light');
} catch {
  useTheme('light');
}
$('theme').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  useTheme(theme);
  try { localStorage.setItem('purplenova-theme', theme); } catch { /* Theme stays active for this visit. */ }
});

function updateBrief() {
  const mode = form.elements.mode.value;
  const video = mode !== 'image';
  artworkToggle.disabled = !providerStatus.images || mode === 'ai-video';
  $('count').textContent = prompt.value.length + ' / 420';
  $('generate').textContent = mode === 'ai-video' ? 'Generate AI Video' : video ? 'Generate Animated Post' : 'Generate image';
  $('generate-all').hidden = video;
  const [name, width, height] = formats[format.value];
  $('preview-format').textContent = name + ' · ' + width + ' × ' + height;
  const url = $('reference-url').value.trim();
  $('use-reference-url').disabled = readingReference || !url || url === referenceUrl;
  $('remove-reference').hidden = !reference && !readingReference && !url;
}

function readBrief() {
  const data = Object.fromEntries(new FormData(form));
  data.prompt = data.prompt.trim();
  data.headline = data.headline.trim();
  data.cta = data.cta.trim();
  return { ...data, reference, referenceUrl, aiArtwork: artworkToggle.checked && !artworkToggle.disabled };
}

function validBrief() {
  prompt.setCustomValidity(prompt.value.trim() ? '' : 'Enter a creative brief.');
  if (readingReference) {
    status.textContent = 'Wait for the reference image to finish loading.';
    return false;
  }
  if ($('reference-url').value.trim() !== referenceUrl) {
    status.textContent = 'Select Use image URL to apply the link, or remove the reference.';
    $('reference-url').focus();
    return false;
  }
  return form.reportValidity();
}

form.addEventListener('input', event => {
  if (event.target === prompt) prompt.setCustomValidity('');
  updateBrief();
});
form.addEventListener('change', updateBrief);

const suggestions = [
  ['Introduce a whipped lavender body butter with a soft, elegant look. Highlight its rich texture and a quiet moment of everyday self-care.', 'A softer kind of glow', 'Shop the collection'],
  ['Announce a spring collection with a vibrant color story and a confident, editorial feel. Invite followers to explore the new arrivals.', 'A fresh start', 'Explore new arrivals'],
  ['Share a behind-the-scenes look at a small-batch product. Keep the styling warm and focus on the care that goes into each piece.', 'Made with care', 'Meet the collection'],
];
let suggestionIndex = 0;
$('suggest').addEventListener('click', () => {
  const [description, headline, cta] = suggestions[suggestionIndex++ % suggestions.length];
  if (prompt.value.trim()) {
    status.textContent = 'Brief idea — ' + description;
    return;
  }
  prompt.value = description;
  $('headline').value ||= headline;
  $('cta').value ||= cta;
  status.textContent = '';
  updateBrief();
  prompt.focus();
});

async function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const imageLimit = 10 * 1024 * 1024;

async function fetchReferenceImage(value) {
  let url;
  try { url = new URL(value); } catch { /* The input may be incomplete. */ }
  if (url?.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Enter a direct HTTPS image URL.');
  }
  let response;
  try {
    response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('The image could not be reached or its host blocks browser access. Download it and upload it instead.');
  }
  if (!response.ok) throw new Error('The image link returned HTTP ' + response.status + '. Check the link or upload the image.');
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!imageTypes.includes(type) || !response.body) {
    throw new Error('Use a direct link to a PNG, JPG, or WebP image.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value: chunk, done } = await reader.read();
    if (done) break;
    size += chunk.byteLength;
    if (size > imageLimit) {
      await reader.cancel();
      throw new Error('The linked image exceeds the 10 MB limit.');
    }
    chunks.push(chunk);
  }
  return new Blob(chunks, { type });
}

$('use-reference-url').addEventListener('click', async () => {
  const value = $('reference-url').value.trim();
  if (!value || activeJob) return;
  const request = ++uploadVersion;
  readingReference = true;
  status.textContent = 'Loading the linked image…';
  updateBrief();
  try {
    const blob = await fetchReferenceImage(value);
    await loadImage(blob);
    if (request === uploadVersion && value === $('reference-url').value.trim()) {
      reference = blob;
      referenceUrl = value;
      $('reference').value = '';
      status.textContent = 'Linked image added as the reference.';
    }
  } catch (error) {
    if (request === uploadVersion) status.textContent = error.message || 'The linked image could not be opened.';
  } finally {
    if (request === uploadVersion) {
      readingReference = false;
      updateBrief();
    }
  }
});

$('reference').addEventListener('change', async () => {
  const request = ++uploadVersion;
  const file = $('reference').files[0];
  reference = null;
  referenceUrl = '';
  $('reference-url').value = '';
  readingReference = false;
  try {
    if (!file) return;
    if (!imageTypes.includes(file.type) || file.size > imageLimit) {
      throw new Error('Choose a PNG, JPG, or WebP file up to 10 MB.');
    }
    readingReference = true;
    updateBrief();
    await loadImage(file);
    if (request === uploadVersion) {
      reference = file;
      status.textContent = 'Reference added: ' + file.name;
    }
  } catch (error) {
    if (request === uploadVersion) {
      $('reference').value = '';
      status.textContent = error.message || 'The reference image could not be opened.';
    }
  } finally {
    if (request === uploadVersion) {
      readingReference = false;
      updateBrief();
    }
  }
});

$('remove-reference').addEventListener('click', () => {
  uploadVersion++;
  readingReference = false;
  reference = null;
  $('reference').value = '';
  referenceUrl = '';
  $('reference-url').value = '';
  status.textContent = 'Reference image removed.';
  updateBrief();
});

function clipText(text, size) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= size) return clean;
  const end = clean.lastIndexOf(' ', size - 1);
  return clean.slice(0, end > size * .6 ? end : size - 1) + '…';
}

function writeLines(ctx, text, left, top, width, leading, maxLines) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const combined = line ? line + ' ' + word : word;
    if (line && ctx.measureText(combined).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = combined;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((part, index) => {
    const value = index === maxLines - 1 && lines.length > maxLines ? part + '…' : part;
    ctx.fillText(value, left, top + leading * index, width);
  });
}

function artboard(brief, image) {
  const canvas = document.createElement('canvas');
  const [, width, height] = formats[brief.format];
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const [base, accent, pale] = palettes[brief.style] || palettes.editorial;
  const margin = Math.round(width * .085);
  const headline = brief.headline || clipText(brief.prompt.split(/[.!?](?:\s|$)/)[0], 62);
  const offset = Array.from(brief.prompt).reduce((sum, char) => (sum + char.codePointAt(0)) % 240, 0) / 240;
  const detail = brief.headline ? clipText(brief.prompt, 125) : clipText(brief.prompt.split(/[.!?](?:\s|$)/).slice(1).join('. '), 125);

  function draw(time = null) {
    const animated = time !== null;
    const scene = animated ? Math.min(2, Math.floor(time / 10)) : 0;
    const drift = animated ? Math.sin(time * Math.PI / 15) * .08 : 0;
    const center = width * (.63 + offset * .14 + drift);
    const background = ctx.createLinearGradient(0, height, width, 0);
    background.addColorStop(0, base);
    background.addColorStop(1, accent);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    if (image) {
      const scale = Math.max(width / image.width, height / image.height) * (1 + (animated ? time / 190 : 0));
      const imageWidth = image.width * scale;
      const imageHeight = image.height * scale;
      ctx.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
      const shade = ctx.createLinearGradient(0, height * .25, 0, height);
      shade.addColorStop(0, '#10091a14');
      shade.addColorStop(.56, '#10091aaf');
      shade.addColorStop(1, '#10091af0');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, width, height);
    } else {
      const glow = ctx.createRadialGradient(center, height * .32, 0, center, height * .32, width * .66);
      glow.addColorStop(0, pale + '99');
      glow.addColorStop(.5, accent + '9e');
      glow.addColorStop(1, base + '00');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = pale + '45';
      ctx.lineWidth = Math.max(1, width / 540);
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(center, height * .33, width * (.2 + i * .046), height * (.09 + i * .023), -.4 + drift, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#ffffff60';
    ctx.lineWidth = width / 600;
    ctx.strokeRect(margin * .55, margin * .55, width - margin * 1.1, height - margin * 1.1);
    const fontSize = width * (brief.style === 'bold' ? .090 : .083);
    const top = height * .56;
    const sceneHeadline = [headline, detail || headline, brief.cta || headline][scene];
    const subtitle = scene === 0 ? detail : scene === 2 && brief.cta ? headline : '';
    ctx.save();
    if (animated) ctx.globalAlpha = Math.min(1, .25 + (time % 10) * 1.7);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';
    ctx.font = (brief.style === 'bold' ? '700 ' : '400 ') + fontSize + 'px ' + (brief.style === 'minimal' ? 'system-ui' : 'Georgia');
    writeLines(ctx, clipText(sceneHeadline, 87), margin, top, width - 2 * margin, fontSize * 1.02, 3);

    if (subtitle) {
      const bodySize = width * .030;
      ctx.fillStyle = '#f7f0ff';
      ctx.font = bodySize + 'px system-ui';
      writeLines(ctx, subtitle, margin, top + fontSize * 3.2, width - 2 * margin, bodySize * 1.24, 2);
    }

    if (brief.cta && scene !== 2) {
      ctx.font = '600 ' + width * .027 + 'px system-ui';
      const label = brief.cta + '  ↗';
      const boxWidth = Math.min(width - margin * 2, ctx.measureText(label).width + margin * .65);
      const boxHeight = width * .056;
      const y = height - margin * 1.7;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(margin, y, boxWidth, boxHeight, boxHeight / 2);
      ctx.fill();
      ctx.fillStyle = base;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, margin * 1.32, y + boxHeight / 2, boxWidth - margin * .64);
    }
    ctx.restore();
  }

  return { canvas, draw };
}

function png(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed.')), 'image/png');
  });
}

function motion(board, signal) {
  if (typeof MediaRecorder === 'undefined' || !board.canvas.captureStream) {
    throw new Error('Video export requires a browser with canvas recording support.');
  }

  const mimeType = ['video/mp4;codecs=avc1.42001f', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm']
    .find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('This browser does not provide a supported video format.');

  board.draw(0);
  const stream = board.canvas.captureStream(30);
  return new Promise((resolve, reject) => {
    let recorder;
    let timer;
    let endTimer;
    let failure;
    const chunks = [];
    const cleanup = () => {
      clearInterval(timer);
      clearTimeout(endTimer);
      signal.removeEventListener('abort', abort);
      stream.getTracks().forEach(track => track.stop());
    };
    function abort() {
      failure = signal.reason;
      if (recorder?.state === 'recording') recorder.stop();
    }

    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = event => {
        cleanup();
        reject(event.error || new Error('Recording failed.'));
      };
      recorder.onstop = () => {
        cleanup();
        if (failure) reject(failure);
        else if (!chunks.length) reject(new Error('The browser returned an empty video.'));
        else resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
      };
      signal.throwIfAborted();
      signal.addEventListener('abort', abort, { once: true });
      recorder.start();
      const start = performance.now();
      timer = setInterval(() => {
        const elapsed = Math.min(duration, (performance.now() - start) / 1000);
        board.draw(elapsed);
        $('progress').value = elapsed;
        $('progress-label').textContent = Math.floor(elapsed) + ' / ' + duration + ' s';
      }, 1000 / 30);
      endTimer = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, duration * 1000);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function zipImages(files) {
  const blocks = [];
  const directory = [];
  const encoder = new TextEncoder();
  let offset = 0;
  let directorySize = 0;
  for (const [name, blob] of files) {
    const data = new Uint8Array(await blob.arrayBuffer());
    const label = encoder.encode(name);
    let crc = -1;
    for (const value of data) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc ^= -1;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, label.length, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    new Uint8Array(central.buffer).set(new Uint8Array(local.buffer, 4, 26), 6);
    central.setUint32(42, offset, true);
    blocks.push(local.buffer, label, data);
    directory.push(central.buffer, label);
    offset += 30 + label.length + data.length;
    directorySize += 46 + label.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...blocks, ...directory, end.buffer], { type: 'application/zip' });
}

function fileName(brief, extension) {
  const name = (brief.headline || brief.prompt).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 44).replace(/^-|-$/g, '');
  return (name || 'purplenova-design') + '-' + brief.format + '.' + extension;
}

function showExport(blob, name, visual = blob) {
  if (currentExportUrl) URL.revokeObjectURL(currentExportUrl);
  currentExportUrl = URL.createObjectURL(blob);
  download.href = currentExportUrl;
  download.download = name;
  download.textContent = 'Download ' + name.split('.').pop().toUpperCase();
  download.hidden = false;
  const video = visual.type.startsWith('video/');
  const media = document.createElement(video ? 'video' : 'img');
  const separate = visual !== blob;
  media.src = separate ? URL.createObjectURL(visual) : currentExportUrl;
  if (separate) {
    const release = () => URL.revokeObjectURL(media.src);
    media.onload = release;
    media.onerror = release;
  }
  if (video) {
    media.controls = true;
    media.playsInline = true;
    media.preload = 'metadata';
    media.setAttribute('aria-label', '30-second video preview');
  } else {
    media.alt = 'Generated social image';
  }
  preview.replaceChildren(media);
}

const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('purplenova-studio', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('work', { keyPath: 'id', autoIncrement: true });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
database.catch(() => {});

async function workRequest(mode, action) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('work', mode);
    const request = action(transaction.objectStore('work'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function generate(all = false) {
  if (activeJob || !validBrief()) return;
  const brief = readBrief();
  const paid = brief.mode === 'ai-video';
  if (paid && !providerStatus.video) {
    status.textContent = 'Connect Runway before generating an AI Video.';
    return;
  }
  if (paid && !brief.reference && lastArtwork?.key !== artworkPrompt(brief)) {
    status.textContent = 'Generate Cloudflare artwork with this brief, upload a starting image, or use an image URL.';
    return;
  }
  if (paid && (typeof MediaRecorder === 'undefined' || !document.createElement('canvas').captureStream)) {
    status.textContent = 'This browser does not support video export.';
    return;
  }
  if (paid && !window.confirm('Generate three Runway clips for about $1.50? Submitted clips may incur charges even if you close this page.')) return;
  const job = new AbortController();
  activeJob = job;
  const isVideo = brief.mode !== 'image' && !all;
  for (const item of form.querySelectorAll('fieldset, #generate, #generate-all, #save-brief')) item.disabled = true;
  $('cancel').hidden = !isVideo || paid;
  $('progress-box').hidden = !isVideo || paid;
  $('progress').value = 0;
  $('progress-label').textContent = '0 / 30 s';
  status.textContent = isVideo ? 'Rendering video. Keep this tab active until the export finishes.' : 'Rendering your design…';
  try {
    if (paid) status.textContent = 'Submitting three clips to Runway…';
    const image = await sourceImage(brief, job.signal);
    job.signal.throwIfAborted();
    const board = artboard(brief, image);
    let blob, name, visual;
    if (isVideo) {
      blob = paid ? await runwayVideo(brief, image, job.signal) : await motion(board, job.signal);
      name = fileName(brief, blob.type.startsWith('video/mp4') ? 'mp4' : 'webm');
    } else {
      board.draw();
      visual = await png(board.canvas);
      blob = visual;
      name = fileName(brief, 'png');
      if (all) {
        const files = [];
        for (const id of Object.keys(formats)) {
          const item = { ...brief, format: id };
          const imageBoard = artboard(item, image);
          imageBoard.draw();
          files.push([fileName(item, 'png'), await png(imageBoard.canvas)]);
        }
        blob = await zipImages(files);
        name = fileName({ ...brief, format: 'all-formats' }, 'zip');
      }
    }
    showExport(blob, name, visual);
    status.textContent = all ? 'All six images are ready.' : isVideo ? 'Your 30-second video is ready.' : 'Your image is ready.';
    try {
      await workRequest('readwrite', store => store.add({ kind: 'export', brief, blob, name, visual }));
      if (location.hash === '#library') renderLibrary();
    } catch {
      status.textContent += ' Download it now. The browser could not save it to history.';
    }
  } catch (error) {
    status.textContent = error.name === 'AbortError' ? 'Video export canceled.' : error.message || 'The design could not be exported.';
  } finally {
    activeJob = null;
    $('cancel').hidden = true;
    $('progress-box').hidden = true;
    for (const item of form.querySelectorAll('fieldset, #generate, #generate-all, #save-brief')) item.disabled = false;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  generate();
});
$('generate-all').addEventListener('click', () => generate(true));
$('cancel').addEventListener('click', () => activeJob?.abort());

$('save-brief').addEventListener('click', async () => {
  if (!validBrief()) return;
  const brief = readBrief();
  $('save-brief').disabled = true;
  try {
    await workRequest('readwrite', store => store.add({ kind: 'brief', brief }));
    status.textContent = 'Brief saved to your library.';
    if (location.hash === '#library') renderLibrary();
  } catch {
    status.textContent = 'The browser could not save this brief.';
  } finally {
    $('save-brief').disabled = Boolean(activeJob);
  }
});

function openBrief(brief) {
  if (activeJob) {
    location.hash = '#studio';
    return;
  }
  uploadVersion++;
  readingReference = false;
  $('reference').value = '';
  reference = brief.reference || null;
  referenceUrl = reference ? brief.referenceUrl || '' : '';
  $('reference-url').value = referenceUrl;
  for (const field of ['mode', 'format', 'prompt', 'headline', 'style', 'cta']) form.elements[field].value = brief[field];
  if (brief.mode === 'ai-video' && !providerStatus.video) form.elements.mode.value = 'video';
  artworkToggle.checked = Boolean(brief.aiArtwork);
  prompt.setCustomValidity('');
  status.textContent = reference ? 'Saved reference restored.' : '';
  updateBrief();
  location.hash = '#studio';
}

function libraryButton(label, action, className = 'btn quiet') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = className;
  button.addEventListener('click', action);
  return button;
}

async function renderLibrary() {
  const lists = { brief: $('saved-list'), export: $('history-list') };
  try {
    const records = await workRequest('readonly', store => store.getAll());
    for (const [kind, list] of Object.entries(lists)) {
      list.replaceChildren();
      const matches = records.filter(record => record.kind === kind).reverse();
      if (!matches.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-card';
        empty.textContent = kind === 'brief' ? 'Saved briefs will appear here.' : 'Your finished exports will appear here.';
        list.append(empty);
      }
      for (const record of matches) {
        const card = document.createElement('article');
        card.className = 'library-card';
        const title = document.createElement('h3');
        title.textContent = record.brief.headline || clipText(record.brief.prompt, 74);
        const meta = document.createElement('p');
        meta.textContent = record.name || formats[record.brief.format][0] + ' · ' + record.brief.mode;
        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.append(libraryButton('Reuse brief', () => openBrief(record.brief)));
        if (record.blob) actions.append(libraryButton('View export', () => {
          if (activeJob) {
            location.hash = '#studio';
            return;
          }
          openBrief(record.brief);
          showExport(record.blob, record.name, record.visual);
          status.textContent = 'Opened from generation history.';
        }));
        card.append(title, meta, actions);
        list.append(card);
      }
    }
  } catch {
    lists.brief.textContent = 'Your browser could not open the local library.';
    lists.export.replaceChildren();
  }
}

const artworkToggle = $('ai-artwork');
const paidMode = $('ai-video-mode');
let providerStatus = { images: false, video: false };
let lastArtwork;

async function studioApi(path, { body, signal } = {}) {
  const response = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || 'The provider request could not be completed.');
  }
  return response;
}

if (location.protocol !== 'file:') {
  studioApi('providers').then(response => response.json()).then(result => {
    providerStatus = result;
    artworkToggle.disabled = !result.images;
    paidMode.disabled = !result.video;
    $('provider-status').textContent = [
      'Cloudflare artwork ' + (result.images ? 'available' : 'requires server setup'),
      'Runway AI Video ' + (result.video ? 'available' : 'requires server setup'),
    ].join(' · ');
    updateBrief();
  }).catch(() => {});
}

function artworkPrompt(brief) {
  return brief.prompt + ' Create clean, ' + brief.style + ' social campaign photography. No words, captions, logos or watermarks.';
}

async function sourceImage(brief, signal) {
  if (brief.reference) return loadImage(brief.reference);
  if (brief.mode === 'ai-video') return loadImage(lastArtwork.blob);
  if (!brief.aiArtwork) return null;
  const key = artworkPrompt(brief);
  if (lastArtwork?.key !== key) {
    const response = await studioApi('artwork', { body: { prompt: key }, signal });
    const blob = await response.blob();
    const image = await loadImage(blob);
    lastArtwork = { key, blob };
    return image;
  }
  return loadImage(lastArtwork.blob);
}

function runwayInput(image, ratio) {
  const [width, height] = ratio.split(':').map(Number);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const scale = Math.max(width / image.width, height / image.height);
  const scaledWidth = image.width * scale;
  const scaledHeight = image.height * scale;
  canvas.getContext('2d', { alpha: false }).drawImage(image, (width - scaledWidth) / 2, (height - scaledHeight) / 2, scaledWidth, scaledHeight);
  return canvas.toDataURL('image/jpeg', .88);
}

function waitForPoll(signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 5500);
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function waitForClip(task, signal) {
  for (let attempt = 0; attempt < 130; attempt++) {
    await waitForPoll(signal);
    const response = await studioApi('video/' + task, { signal });
    const { status } = await response.json();
    if (status === 'SUCCEEDED') {
      const media = await studioApi('video/' + task + '/clip', { signal });
      return media.blob();
    }
    if (['FAILED', 'CANCELED'].includes(status)) throw new Error('Runway could not finish one of the clips. Review the task in the Runway dashboard.');
  }
  throw new Error('Runway is still processing. Review the tasks in the Runway dashboard before requesting another video.');
}

async function composeRunway(clips, brief, signal) {
  const entries = clips.map(blob => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    return { video, url };
  });
  try {
    await Promise.all(entries.map(({ video }) => new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        video.onloadeddata = null;
        video.onerror = null;
      };
      const finish = error => {
        cleanup();
        if (error) reject(error);
        else if (!Number.isFinite(video.duration) || video.duration < 9.5) reject(new Error('Runway returned a clip shorter than expected.'));
        else resolve();
      };
      const abort = () => finish(signal.reason);
      const timeout = setTimeout(() => finish(new Error('A Runway clip could not be decoded.')), 15000);
      if (signal.aborted) abort();
      else if (video.readyState >= 2) finish();
      else {
        signal.addEventListener('abort', abort, { once: true });
        video.onloadeddata = () => finish();
        video.onerror = () => finish(new Error('A Runway clip could not be decoded.'));
      }
    })));
    const canvas = document.createElement('canvas');
    const [, width, height] = formats[brief.format];
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    let previous = -1;
    let playbackError;
    const board = { canvas, draw(time) {
      const scene = Math.min(2, Math.floor(time / 10));
      const video = entries[scene].video;
      if (previous !== scene) {
        if (previous >= 0) entries[previous].video.pause();
        previous = scene;
        video.play().catch(error => { playbackError = error; });
      }
      const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
      const sw = video.videoWidth * scale;
      const sh = video.videoHeight * scale;
      ctx.drawImage(video, (width - sw) / 2, (height - sh) / 2, sw, sh);
      const overlay = scene === 0 ? brief.headline : scene === 2 ? brief.cta : '';
      if (overlay) {
        const margin = width * .08;
        const gradient = ctx.createLinearGradient(0, height * .66, 0, height);
        gradient.addColorStop(0, '#0e071900');
        gradient.addColorStop(1, '#0e0719de');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, height * .66, width, height * .34);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'top';
        ctx.font = '600 ' + width * .063 + 'px Georgia';
        writeLines(ctx, overlay, margin, height * .78, width - margin * 2, width * .07, 2);
      }
    } };
    const result = await motion(board, signal);
    if (playbackError) throw new Error('This browser could not play the clips while assembling the export.');
    return result;
  } finally {
    for (const { video, url } of entries) {
      video.pause();
      URL.revokeObjectURL(url);
    }
  }
}

async function runwayVideo(brief, image, signal) {
  const [, width, height] = formats[brief.format];
  const ratio = width === height ? '960:960' : height / width > 1.6 ? '720:1280' : '832:1104';
  const request = await studioApi('video', { body: {
    prompt: brief.prompt,
    image: runwayInput(image, ratio),
    ratio,
    acceptCost: true,
  }, signal });
  const { tasks, rejected } = await request.json();
  if (rejected || tasks?.length !== 3) {
    throw new Error('Runway accepted only part of the request. Review your Runway dashboard before submitting again.');
  }
  status.textContent = 'Runway is generating three clips. Keep this tab open.';
  const clips = await Promise.all(tasks.map(task => waitForClip(task, signal)));
  status.textContent = 'Assembling your 30-second video. Keep this tab active.';
  $('progress-box').hidden = false;
  return composeRunway(clips, brief, signal);
}

window.addEventListener('hashchange', route);
updateBrief();
route();

