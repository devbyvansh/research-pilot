import { readFile, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'

const dist = resolve('dist')
const env = loadEnv('production', process.cwd(), 'VITE_')
const rawSiteUrl = (process.env.VITE_SITE_URL || env.VITE_SITE_URL)?.trim()
const indexPath = resolve(dist, 'index.html')
let html = await readFile(indexPath, 'utf8')
html = html.replace(/\s*<link rel="canonical"[^>]*>/g, '').replace(/\s*<meta property="og:url"[^>]*>/g, '')

if (rawSiteUrl) {
  const siteUrl = new URL(rawSiteUrl).origin
  const pageUrl = `${siteUrl}/`
  html = html.replace('</head>', `    <link rel="canonical" href="${pageUrl}" />\n    <meta property="og:url" content="${pageUrl}" />\n    <meta property="og:image" content="${siteUrl}/social-card.png" />\n    <meta name="twitter:image" content="${siteUrl}/social-card.png" />\n  </head>`)
  await writeFile(resolve(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`)
  await writeFile(resolve(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${pageUrl}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url></urlset>\n`)
} else {
  await rm(resolve(dist, 'sitemap.xml'), { force: true })
}
await writeFile(indexPath, html)
