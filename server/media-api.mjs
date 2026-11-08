const runway = 'https://api.dev.runwayml.com/v1';
const motion = [
  'Opening hero shot. Slow push in with subtle parallax.',
  'Detail shot. Slow lateral camera movement and soft lighting.',
  'Closing hero shot. Gentle pull back and hold the final composition.',
];

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message, status) => json({ error: message }, status);

async function callRunway(env, route, body) {
  const response = await fetch(runway + route, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + env.RUNWAYML_API_SECRET,
      'X-Runway-Version': '2024-11-06',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error('Runway returned HTTP ' + response.status + '. Check API credentials, credit balance, or usage limits.');
  return response.json();
}

async function readInput(request, maximum) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    return null;
  }
}

export async function mediaRequest(request, env, local = false) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  if (!local && !request.headers.get('oai-authenticated-user-id')) return fail('Sign in to PurpleNova Studio.', 401);
  if (request.headers.get('sec-fetch-site') === 'cross-site') return fail('Request blocked.', 403);
  if (request.method === 'POST' &&
      (request.headers.get('origin') !== url.origin || !request.headers.get('content-type')?.startsWith('application/json'))) {
    return fail('Send requests from the PurpleNova editor.', 403);
  }
  const images = Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
  const video = Boolean(env.RUNWAYML_API_SECRET);
  if (url.pathname === '/api/providers' && request.method === 'GET') return json({ images, video });

  try {
    if (url.pathname === '/api/artwork' && request.method === 'POST') {
      if (!images) return fail('Cloudflare image generation needs server credentials.', 503);
      const input = await readInput(request, 4096);
      const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : '';
      if (!prompt || prompt.length > 700) return fail('Enter an artwork prompt up to 700 characters.', 400);
      const account = encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID);
      const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/ai/run/@cf/black-forest-labs/flux-1-schnell';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(35000),
      });
      if (!response.ok) return fail('Cloudflare image generation returned HTTP ' + response.status + '.', 502);
      if (response.headers.get('content-type')?.startsWith('image/')) {
        return new Response(response.body, { headers: { 'Content-Type': response.headers.get('content-type'), 'Cache-Control': 'no-store' } });
      }
      const result = await response.json();
      const image = result?.result?.image ?? result?.image;
      if (!image) return fail('Cloudflare returned no image.', 502);
      return new Response(Uint8Array.from(atob(image), byte => byte.charCodeAt(0)), {
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname === '/api/video' && request.method === 'POST') {
      if (!video) return fail('Runway video generation needs a server API key.', 503);
      const input = await readInput(request, 5_300_000);
      const { prompt, image, ratio, acceptCost } = input || {};
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 700 ||
          typeof image !== 'string' || image.length > 5_000_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image) ||
          !['720:1280', '832:1104', '960:960'].includes(ratio) || acceptCost !== true) {
        return fail('A valid brief, starting image, output format, and cost confirmation are required.', 400);
      }
      const submissions = await Promise.allSettled(motion.map(direction => callRunway(env, '/image_to_video', {
        model: 'gen4_turbo',
        duration: 10,
        ratio,
        promptImage: image,
        promptText: prompt + '\n' + direction + ' Preserve the subject and its appearance. No added text.',
      })));
      const tasks = submissions.map(item => item.status === 'fulfilled' && typeof item.value.id === 'string' ? item.value.id : null);
      return json({ tasks, rejected: tasks.filter(task => !task).length }, tasks.some(Boolean) ? 202 : 502);
    }

    const match = /^\/api\/video\/([a-f0-9-]{36})(\/clip)?$/i.exec(url.pathname);
    if (match && request.method === 'GET') {
      if (!video) return fail('Runway video generation needs a server API key.', 503);
      const task = await callRunway(env, '/tasks/' + match[1]);
      if (!match[2]) return json({ status: task.status });
      if (task.status !== 'SUCCEEDED') return fail('The clip is still processing or failed.', 409);
      const output = new URL(task.output?.[0]);
      if (output.protocol !== 'https:') return fail('Runway returned an invalid clip.', 502);
      const response = await fetch(output, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) return fail('The Runway clip is unavailable or has expired.', 502);
      return new Response(response.body, { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' } });
    }
    return fail('Endpoint unavailable.', 404);
  } catch (error) {
    return fail(error.message.startsWith('Runway returned HTTP') ? error.message : 'The media provider could not complete the request.', 502);
  }
}
