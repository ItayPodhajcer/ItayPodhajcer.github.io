// Converts Medium HTML exports into Astro content-collection Markdown posts.
//
// For each *article* (responses/comments are skipped):
//   - downloads images next to the generated index.md (relative paths)
//   - inlines embedded GitHub gists as syntax-highlighted fenced code blocks
//   - merges Medium's split <pre> lines, converts link cards, code, links, etc.
//
// Usage: node scripts/convert-medium.mjs [postsDir]
//   postsDir defaults to C:\Users\Itay\Desktop\posts

import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import TurndownService from 'turndown';
import turndownPluginGfm from 'turndown-plugin-gfm';
import * as cheerio from 'cheerio';

const { gfm } = turndownPluginGfm;

const POSTS_DIR = process.argv[2] || 'C:\\Users\\Itay\\Desktop\\posts';
const OUT_DIR = path.resolve('src/content/blog');
const IMG_MAX_WIDTH = 1400;

// --- GitHub token (raises gist API limit from 60/hr to 5000/hr) ----------
let GH_TOKEN = '';
try {
  GH_TOKEN = execSync('gh auth token', { encoding: 'utf8' }).trim();
  console.log('Using authenticated GitHub token for gist fetching.');
} catch {
  console.warn('No gh token available; gist fetching limited to 60/hr.');
}

const ghHeaders = () => {
  const h = {
    'User-Agent': 'medium-converter',
    Accept: 'application/vnd.github+json',
  };
  if (GH_TOKEN) h.Authorization = `Bearer ${GH_TOKEN}`;
  return h;
};

// --- helpers --------------------------------------------------------------
const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.warn('  ! ' + msg);
};

function slugify(str) {
  return String(str)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_');
}

function yamlStr(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

const LANG_MAP = {
  'C#': 'csharp',
  'F#': 'fsharp',
  Shell: 'bash',
  'Shell Session': 'bash',
  Dockerfile: 'dockerfile',
  HCL: 'hcl',
  YAML: 'yaml',
  JSON: 'json',
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  Python: 'python',
  Go: 'go',
  Solidity: 'solidity',
  PowerShell: 'powershell',
  Markdown: 'markdown',
  Text: 'text',
  INI: 'ini',
  TOML: 'toml',
  XML: 'xml',
  HTML: 'html',
  CSS: 'css',
  SCSS: 'scss',
  Makefile: 'makefile',
  Java: 'java',
  Kotlin: 'kotlin',
  Rust: 'rust',
  Ruby: 'ruby',
  'C++': 'cpp',
  C: 'c',
  SQL: 'sql',
  Bicep: 'bicep',
};

const EXT_MAP = {
  js: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  py: 'python',
  cs: 'csharp',
  sh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  tf: 'hcl',
  tfvars: 'hcl',
  sol: 'solidity',
  md: 'markdown',
  xml: 'xml',
  toml: 'toml',
  ps1: 'powershell',
  go: 'go',
  java: 'java',
  rs: 'rust',
  rb: 'ruby',
  sql: 'sql',
  bicep: 'bicep',
  dockerfile: 'dockerfile',
  ini: 'ini',
  conf: 'ini',
  cfg: 'ini',
  toml: 'toml',
  css: 'css',
  html: 'html',
};

function langToFence(language, filename) {
  if (language && LANG_MAP[language]) return LANG_MAP[language];
  if (language) return language.toLowerCase().replace(/[^a-z0-9+#]/g, '');
  const lower = String(filename || '').toLowerCase();
  if (lower === 'dockerfile' || lower.startsWith('dockerfile')) return 'dockerfile';
  const ext = lower.includes('.') ? lower.split('.').pop() : '';
  return EXT_MAP[ext] || '';
}

// Some GitHub Linguist language names have no Shiki equivalent (Shiki warns
// and falls back to plaintext). For those we sniff the content instead.
const UNSUPPORTED_LANGS = new Set([
  'smarty',
  'gotemplate',
  'piprequirements',
  'rawtoken',
  'unixassembly',
]);

function sniffLang(content) {
  const t = String(content).replace(/^\uFEFF/, '').trimStart();
  if (!t) return '';
  if (t[0] === '{') return 'json';
  // systemd unit / INI: [Section] headers plus key=value lines.
  if (/^\[[\w .+-]+\]\s*$/m.test(t) && /^[\w.-]+\s*=/m.test(t)) return 'ini';
  // YAML: "key:" lines or list items, without JSON braces.
  if (/^\s*(-\s+\S|[\w.-]+:\s)/m.test(t)) return 'yaml';
  return '';
}

function resolveFence(language, filename, content) {
  const norm = String(language || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]/g, '');
  if (language && !UNSUPPORTED_LANGS.has(norm)) {
    return langToFence(language, filename);
  }
  // Unsupported or missing language -> try filename, then content sniffing.
  return langToFence(null, filename) || sniffLang(content);
}

// --- gist fetching --------------------------------------------------------
const gistCache = new Map();

async function fetchGist(id) {
  if (gistCache.has(id)) return gistCache.get(id);
  const res = await fetch(`https://api.github.com/gists/${id}`, {
    headers: ghHeaders(),
  });
  if (!res.ok) throw new Error(`gist ${id} -> HTTP ${res.status}`);
  const data = await res.json();
  const files = [];
  for (const f of Object.values(data.files || {})) {
    let content = f.content;
    if (f.truncated || content == null) {
      const r = await fetch(f.raw_url, { headers: ghHeaders() });
      if (!r.ok) throw new Error(`gist ${id} raw ${f.filename} -> HTTP ${r.status}`);
      content = await r.text();
    }
    files.push({ filename: f.filename, language: f.language, content });
  }
  gistCache.set(id, files);
  return files;
}

// --- image download -------------------------------------------------------
async function downloadImage(url, destDir, imageId) {
  let fetchUrl = url
    .replace(/\/max\/\d+\//, `/max/${IMG_MAX_WIDTH}/`)
    .replace(/\/fit\/c\/\d+\/\d+\//, `/max/${IMG_MAX_WIDTH}/`);

  let res = await fetch(fetchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok && fetchUrl !== url) {
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  }
  if (!res.ok) throw new Error(`image ${url} -> HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());

  let base = imageId || path.basename(new URL(url).pathname);
  base = sanitizeFilename(base);
  if (!/\.[a-z0-9]+$/i.test(base)) {
    const ct = res.headers.get('content-type') || '';
    const ext = ct.includes('png')
      ? '.png'
      : ct.includes('gif')
        ? '.gif'
        : ct.includes('svg')
          ? '.svg'
          : ct.includes('webp')
            ? '.webp'
            : '.jpg';
    base += ext;
  }

  await fs.writeFile(path.join(destDir, base), buf);
  return base;
}

// --- turndown -------------------------------------------------------------
function makeTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    fence: '```',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    hr: '---',
  });
  td.use(gfm);
  // Drop leftover script/style noise.
  td.remove(['script', 'style', 'noscript']);
  return td;
}

// --- per-file processing --------------------------------------------------
const usedSlugs = new Set();

function uniqueSlug(slug) {
  let s = slug || 'post';
  let n = 2;
  while (usedSlugs.has(s)) s = `${slug}-${n++}`;
  usedSlugs.add(s);
  return s;
}

async function processFile(filePath) {
  const html = await fs.readFile(filePath, 'utf8');
  const $ = cheerio.load(html);

  // Responses/comments have no title heading -> skip.
  if ($('.graf--title').length === 0) {
    return { skipped: true, file: path.basename(filePath) };
  }

  const title =
    $('header h1.p-name').first().text().trim() ||
    $('title').first().text().trim();
  const description = $('section[data-field="subtitle"]').first().text().trim();
  const datetime = $('footer time.dt-published').first().attr('datetime');
  const pubDate = datetime ? new Date(datetime) : new Date();
  const canonical = $('footer a.p-canonical').attr('href') || '';

  const slug = uniqueSlug(slugify(title));
  const postDir = path.join(OUT_DIR, slug);
  await fs.mkdir(postDir, { recursive: true });

  const body = $('section[data-field="body"]').first();

  // Remove decorative section dividers and the duplicated title heading(s).
  body.find('div.section-divider').remove();
  body.find('.graf--title').remove();

  // 1) Gists -> inline fenced code blocks.
  const gistFigures = body
    .find('figure')
    .toArray()
    .filter((el) => $(el).find('script[src*="gist.github.com"]').length > 0);
  for (const fig of gistFigures) {
    const src = $(fig).find('script[src*="gist.github.com"]').attr('src') || '';
    const m = src.match(/gist\.github\.com\/(?:[^/]+\/)?([0-9a-fA-F]+)\.js/);
    const id = m ? m[1] : null;
    if (!id) {
      warn(`could not parse gist id from ${src}`);
      $(fig).remove();
      continue;
    }
    try {
      const files = await fetchGist(id);
      const $frag = $('<div></div>');
      for (const f of files) {
        if (files.length > 1) {
          $frag.append($('<p></p>').append($('<strong></strong>').text(f.filename)));
        }
        const lang = resolveFence(f.language, f.filename, f.content);
        const $code = $('<code></code>');
        if (lang) $code.addClass('language-' + lang);
        $code.text(String(f.content).replace(/\n+$/, ''));
        $frag.append($('<pre></pre>').append($code));
      }
      $(fig).replaceWith($frag.children());
    } catch (e) {
      warn(`gist ${id}: ${e.message} (fell back to link)`);
      $(fig).replaceWith(
        $('<p></p>').append(
          $('<a></a>')
            .attr('href', `https://gist.github.com/${id}`)
            .text('View gist on GitHub')
        )
      );
    }
  }

  // 2) Images -> download + relative paths. First featured image -> hero.
  let heroImage;
  let heroImageAlt;
  let imageCount = 0;
  const figures = body.find('figure').toArray();
  for (const fig of figures) {
    const $fig = $(fig);
    const $img = $fig.find('img').first();
    if (!$img.length) continue;
    const src = $img.attr('src');
    if (!src) {
      $fig.remove();
      continue;
    }
    const caption = $fig.find('figcaption').text().trim();
    const isFeatured = $img.attr('data-is-featured') === 'true';
    let filename;
    try {
      filename = await downloadImage(src, postDir, $img.attr('data-image-id'));
      imageCount++;
    } catch (e) {
      warn(`image ${src}: ${e.message} (kept remote url)`);
      filename = null;
    }
    const localSrc = filename ? './' + filename : src;

    if (isFeatured && !heroImage && filename) {
      heroImage = localSrc;
      heroImageAlt = caption || title;
      $fig.remove();
      continue;
    }

    const $p = $('<p></p>').append(
      $('<img>').attr('src', localSrc).attr('alt', caption || '')
    );
    $fig.replaceWith($p);
    if (caption) $p.after($('<p></p>').append($('<em></em>').text(caption)));
  }

  // 3) GitHub/link "mixtape" cards -> blockquote with a titled link.
  body
    .find('.graf--mixtapeEmbed')
    .toArray()
    .forEach((el) => {
      const $el = $(el);
      const $a = $el.find('a.markup--mixtapeEmbed-anchor').first();
      const href = $a.attr('href') || $a.attr('data-href');
      if (!href) {
        $el.remove();
        return;
      }
      const t = $el.find('strong').first().text().trim() || href;
      const d = $el.find('em').first().text().trim();
      const $bq = $('<blockquote></blockquote>');
      $bq.append(
        $('<p></p>').append($('<a></a>').attr('href', href).append($('<strong></strong>').text(t)))
      );
      if (d) $bq.append($('<p></p>').text(d));
      $el.replaceWith($bq);
    });

  // 4) Merge Medium's per-line <pre> blocks into single fenced code blocks.
  const pres = body.find('pre.graf--pre').toArray();
  const consumed = new Set();
  for (const el of pres) {
    if (consumed.has(el)) continue;
    const $el = $(el);
    const lines = [$el.find('code').text()];
    let $n = $el.next();
    while ($n.length && $n.is('pre.graf--pre')) {
      lines.push($n.find('code').text());
      consumed.add($n[0]);
      const $next = $n.next();
      $n.remove();
      $n = $next;
    }
    $el.empty().append($('<code></code>').text(lines.join('\n')));
  }

  // 5) Promote heading levels (Medium body uses h3/h4; title is the page h1).
  body
    .find('h3')
    .toArray()
    .forEach((el) => $(el).replaceWith($('<h2></h2>').html($(el).html())));
  body
    .find('h4')
    .toArray()
    .forEach((el) => $(el).replaceWith($('<h3></h3>').html($(el).html())));

  // 5b) Linked inline code (<code><a>text</a></code>) -> clickable code,
  //     since a Markdown link cannot live inside a literal backtick span.
  body
    .find('code')
    .toArray()
    .forEach((el) => {
      const $el = $(el);
      const $a = $el.children('a');
      if ($a.length === 1 && $el.children().length === 1) {
        const href = $a.attr('href');
        if (href) {
          $el.replaceWith(
            $('<a></a>')
              .attr('href', href)
              .append($('<code></code>').text($a.text()))
          );
        }
      }
    });

  // 6) Clean any leftover embeds we don't handle.
  const leftoverIframes = body.find('iframe').length;
  if (leftoverIframes) warn(`${leftoverIframes} unhandled <iframe> in "${title}"`);
  body.find('script').remove();

  // Convert to Markdown.
  const td = makeTurndown();
  let markdown = td.turndown(body.html() || '');
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

  // Frontmatter.
  const fm = [`title: ${yamlStr(title)}`];
  if (description) fm.push(`description: ${yamlStr(description)}`);
  fm.push(`pubDate: ${yamlStr(pubDate.toISOString())}`);
  if (heroImage) {
    fm.push(`heroImage: ${yamlStr(heroImage)}`);
    fm.push(`heroImageAlt: ${yamlStr(heroImageAlt || title)}`);
  }
  if (canonical) fm.push(`mediumUrl: ${yamlStr(canonical)}`);

  const out = `---\n${fm.join('\n')}\n---\n\n${markdown}\n`;
  await fs.writeFile(path.join(postDir, 'index.md'), out, 'utf8');

  return {
    skipped: false,
    title,
    slug,
    images: imageCount,
    hero: !!heroImage,
    gists: gistFigures.length,
  };
}

// --- main -----------------------------------------------------------------
async function main() {
  // Clean output collection for a deterministic re-run.
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const entries = (await fs.readdir(POSTS_DIR))
    .filter((f) => f.toLowerCase().endsWith('.html'))
    .sort();

  let converted = 0;
  let skipped = 0;
  let totalImages = 0;

  for (const entry of entries) {
    const full = path.join(POSTS_DIR, entry);
    try {
      const r = await processFile(full);
      if (r.skipped) {
        skipped++;
        console.log(`SKIP (response) : ${entry}`);
      } else {
        converted++;
        totalImages += r.images;
        console.log(
          `OK  ${r.slug}  [img:${r.images}${r.hero ? '+hero' : ''} gist:${r.gists}]`
        );
      }
    } catch (e) {
      warn(`FAILED ${entry}: ${e.stack || e.message}`);
    }
  }

  console.log('\n==================== SUMMARY ====================');
  console.log(`Articles converted : ${converted}`);
  console.log(`Responses skipped  : ${skipped}`);
  console.log(`Images downloaded  : ${totalImages}`);
  console.log(`Unique gists fetched: ${gistCache.size}`);
  console.log(`Warnings           : ${warnings.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
