# Nyxvids

A video-first YouTube client with a calmer interface, full video playback, search, related videos, watch history, likes, subscriptions, and playlist access.

## Run locally

```bash
npm install
npm run dev
```

Public browsing and playback work without configuration. Google-connected features use the YouTube Data API and require these environment variables:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AUTH_SECRET=
```

Create a Google OAuth 2.0 Web application, enable YouTube Data API v3, and add this redirect URI:

```text
https://YOUR_DOMAIN/api/auth/callback
```

`AUTH_SECRET` should be a long random value. The app requests read-only YouTube access and stores the session in an encrypted, HTTP-only cookie.

## Notes

YouTube's official API does not expose the exact personalized Home recommendation feed. Nyxvids builds its signed-in feed from subscription uploads, liked videos, playlists, and local watch history.
