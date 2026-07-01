exports.handler = async function () {
  const siteUrl = 'https://strategywestplanning.com'
  const projectId = '0ziwk9hm'
  const dataset = 'production'
  const apiVersion = 'v2024-01-01'

  const staticPages = [
    { path: '', priority: '1.0', changefreq: 'weekly' },
    { path: 'about-us', priority: '0.8', changefreq: 'monthly' },
    { path: 'cash-flow-banking', priority: '0.9', changefreq: 'monthly' },
    { path: 'college-planning', priority: '0.9', changefreq: 'monthly' },
    { path: 'disability-planning', priority: '0.9', changefreq: 'monthly' },
    { path: 'retirement-estate', priority: '0.9', changefreq: 'monthly' },
    { path: 'insights', priority: '0.9', changefreq: 'weekly' },
    { path: 'calculators', priority: '0.7', changefreq: 'monthly' },
    { path: 'guides', priority: '0.7', changefreq: 'monthly' },
    { path: 'faq', priority: '0.7', changefreq: 'monthly' },
    { path: 'testimonials', priority: '0.7', changefreq: 'monthly' },
    { path: 'privacy-policy', priority: '0.3', changefreq: 'yearly' },
    { path: 'terms-of-service', priority: '0.3', changefreq: 'yearly' },
  ]

  const escapeXml = (value) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')

  const formatDate = (date) => {
    if (!date) return new Date().toISOString()
    return new Date(date).toISOString()
  }

  const blogQuery = encodeURIComponent(`
    *[_type == "blogPost" && defined(slug.current)] | order(publishedAt desc) {
      "slug": slug.current,
      "updatedAt": coalesce(_updatedAt, publishedAt)
    }
  `)

  const sanityUrl = `https://${projectId}.api.sanity.io/${apiVersion}/data/query/${dataset}?query=${blogQuery}`

  let blogPosts = []

  try {
    const response = await fetch(sanityUrl)
    const data = await response.json()
    blogPosts = data.result || []
  } catch (error) {
    blogPosts = []
  }

  const staticUrls = staticPages.map((page) => {
    const loc = page.path ? `${siteUrl}/${page.path}` : siteUrl

    return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${formatDate()}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  })

  const blogUrls = blogPosts.map((post) => {
    return `
  <url>
    <loc>${escapeXml(`${siteUrl}/insights/${post.slug}`)}</loc>
    <lastmod>${formatDate(post.updatedAt)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
  })

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls.join('')}
${blogUrls.join('')}
</urlset>`

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
    body: sitemap,
  }
}
