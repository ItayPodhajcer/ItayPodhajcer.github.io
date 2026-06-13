const getRobotsTxt = (sitemapURL) => `User-agent: *
Allow: /

Sitemap: ${sitemapURL.href}
`;

export function GET(context) {
	const sitemapURL = new URL('sitemap-index.xml', context.site);
	return new Response(getRobotsTxt(sitemapURL));
}
