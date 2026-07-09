import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { query } = await req.json();
  if (!query) return Response.json({ error: 'Query is required' }, { status: 400 });

  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: query,
    gsrlimit: '20',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '400',
    format: 'json',
    origin: '*',
  });

  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: {
      'User-Agent': 'SwabbieStudyApp/1.0 (educational flashcard app; contact: support@example.com)',
      'Accept': 'application/json',
    },
  });
  if (!response.ok) return Response.json({ images: [] });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { return Response.json({ images: [] }); }

  const pages = data?.query?.pages || {};
  const images = Object.values(pages)
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info) return null;
      const url = info.thumburl || info.url;
      const fullUrl = info.url;
      const title = page.title?.replace('File:', '') || '';
      return { url, fullUrl, title };
    })
    .filter(Boolean);

  return Response.json({ images });
});