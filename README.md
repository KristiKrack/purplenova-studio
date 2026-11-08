# PurpleNova Studio

## Start the studio

Extract the ZIP. With Node.js 22 or newer installed, open a terminal in the extracted folder.

- For template images and Animated Posts, open `dist/index.html` or run `node server/local.mjs`.
- For Cloudflare artwork or Runway AI Video, copy `.env.example` to `.env`, fill in the credentials you want to use, and run `node --env-file=.env server/local.mjs`.
- Open http://127.0.0.1:4173/ when using the local server. The server listens only on loopback.

## Reference images

Upload a PNG, JPG, or WebP file or enter a direct HTTPS image URL and click **Use image URL**. The image host must allow cross-origin access. If the link is blocked, download the image and upload it. Both options support up to 10 MB.

## Provider setup

- Cloudflare Workers AI uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Create an account-scoped API token with Workers AI run access. Select **Generate artwork with Cloudflare** to create artwork from your brief.
- Runway uses `RUNWAYML_API_SECRET` from the Runway developer portal. Use artwork generated from the current brief or provide a starting image by upload or direct image URL. Select **AI Video**, then confirm the estimated charge. The editor submits three 10-second Gen-4 Turbo clips and assembles them in the browser with your headline and call to action.
- Keep `.env` private. In hosted deployments, set the same names as server environment values or secrets. Keep provider-backed generation behind authenticated, private access.

If a Runway request times out, fails in part, or the tab closes, check your Runway developer dashboard before submitting it again. Accepted clips may continue processing.
