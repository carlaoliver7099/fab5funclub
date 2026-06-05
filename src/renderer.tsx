import { jsxRenderer } from 'hono/jsx-renderer'

// Cache-bust on every deploy so phones don't keep serving old app.js / style.css.
// Bump this manually whenever a meaningful frontend change ships.
const ASSET_VERSION = '2026-06-05-awards-progress-v1'

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Fab 5 Fun Club 🌈 Sunshine Coast Adventure Crew</title>
        <meta name="description" content="The Fab 5 Fun Club - weekend adventures on the Sunshine Coast!" />
        <link rel="icon" type="image/png" href="/static/logo.png" />
        <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Bungee&display=swap" rel="stylesheet" />
        <link href={`/static/style.css?v=${ASSET_VERSION}`} rel="stylesheet" />
      </head>
      <body>
        {children}
        <script src={`/static/app.js?v=${ASSET_VERSION}`}></script>
        <script src={`/static/assets.js?v=${ASSET_VERSION}`}></script>
        <script src={`/static/fundraising.js?v=${ASSET_VERSION}`}></script>
        <script src={`/static/dofe-coverage.js?v=${ASSET_VERSION}`}></script>
        <script src={`/static/backlog.js?v=${ASSET_VERSION}`}></script>
        <script src={`/static/awards-progress.js?v=${ASSET_VERSION}`}></script>
      </body>
    </html>
  )
})
