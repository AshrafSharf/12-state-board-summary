#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get chapter name from command line arguments
const chapterName = process.argv[2];

if (!chapterName) {
    console.error('Usage: node build-chapter-unified.js <chapter_name>');
    console.error('Example: node build-chapter-unified.js 06-app-vector-algebra');
    process.exit(1);
}

// Paths
const chapterDir = path.join(__dirname, 'chapters', chapterName);
const slidesDir = path.join(chapterDir, 'slides');
const chapterHtmlPath = path.join(chapterDir, `${chapterName}.html`);
const chapterCssPath = path.join(chapterDir, `${chapterName}.css`);
const slidesCssPath = path.join(slidesDir, 'slides.css');
const buildDir = path.join(__dirname, 'build');

// Check if chapter exists
if (!fs.existsSync(chapterDir)) {
    console.error(`Error: Chapter not found: ${chapterDir}`);
    process.exit(1);
}

// Check if slides directory exists
if (!fs.existsSync(slidesDir)) {
    console.error(`Error: Slides directory not found: ${slidesDir}`);
    process.exit(1);
}

console.log(`Building unified single-file HTML for chapter ${chapterName}...`);

// Create build directory if it doesn't exist
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

// Read all slide HTML files (sorted by filename)
const slideFiles = fs.readdirSync(slidesDir)
    .filter(file => file.endsWith('.html'))
    .sort();

if (slideFiles.length === 0) {
    console.error(`Error: No HTML slide files found in ${slidesDir}`);
    process.exit(1);
}

console.log(`  Found ${slideFiles.length} slides`);

// Read CSS files
let chapterCss = '';
let slidesCss = '';

if (fs.existsSync(chapterCssPath)) {
    chapterCss = fs.readFileSync(chapterCssPath, 'utf8');
    console.log(`  Loaded chapter CSS: ${chapterName}.css`);
}

if (fs.existsSync(slidesCssPath)) {
    slidesCss = fs.readFileSync(slidesCssPath, 'utf8');
    console.log(`  Loaded slides CSS: slides.css`);
}

// Read chapter landing page HTML
let landingPageContent = '';
let chapterTitle = '';

if (fs.existsSync(chapterHtmlPath)) {
    const chapterHtml = fs.readFileSync(chapterHtmlPath, 'utf8');
    console.log(`  Loaded chapter landing page: ${chapterName}.html`);

    // Extract chapter title
    const titleMatch = chapterHtml.match(/<h1>([^<]+)<\/h1>/);
    if (titleMatch) {
        chapterTitle = titleMatch[1].replace(/&mdash;/g, '—');
    }

    // Extract main content (from <main> tag)
    const mainMatch = chapterHtml.match(/<main>([\s\S]*?)<\/main>/);
    if (mainMatch) {
        landingPageContent = mainMatch[1].trim();

        // Convert slide links to hash-based links
        // slides/01-overview.html → #slide-2
        // slides/02-dot-cross-products.html → #slide-3, etc.
        landingPageContent = landingPageContent.replace(/href="slides\/(\d+)-[^"]+\.html"/g, (match, slideNum) => {
            const hashSlideNum = parseInt(slideNum) + 1; // +1 because landing page is slide 1
            return `href="#slide-${hashSlideNum}"`;
        });

        console.log(`  Extracted and converted landing page content`);
    }
}

// Extract slide information
const slides = [];
let firstSlideHtml = '';

for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i];
    const slideHtml = fs.readFileSync(path.join(slidesDir, slideFile), 'utf8');

    // Extract chapter title from first slide if not already set
    if (i === 0 && !chapterTitle) {
        firstSlideHtml = slideHtml;
        const titleMatch = slideHtml.match(/<span class="chapter-title">([^<]+)<\/span>/);
        if (titleMatch) {
            chapterTitle = titleMatch[1];
        }
    }

    // Extract the slide content (everything inside <div class="slide-content">)
    const contentMatch = slideHtml.match(/<div class="slide-content">([\s\S]*?)<\/div>\s*<\/div>\s*<nav class="slide-nav">/);
    if (!contentMatch) {
        console.warn(`  Warning: Could not extract content from ${slideFile}`);
        continue;
    }

    const content = contentMatch[1].trim();

    // Extract the section class name for topic color
    const sectionMatch = content.match(/<section class="card ([^"]+)">/);
    const topicClass = sectionMatch ? sectionMatch[1] : '';

    slides.push({
        index: i + 2, // Start from 2 since landing page is slide 1
        filename: slideFile,
        content: content,
        topicClass: topicClass
    });
}

console.log(`  Extracted ${slides.length} slide contents`);

// Calculate total slides (landing page + all slides)
const totalSlides = landingPageContent ? slides.length + 1 : slides.length;
console.log(`  Total slides (including landing page): ${totalSlides}`);

// Generate slide sections HTML
let slideSections = '';

// Add landing page as slide 1 if available
if (landingPageContent) {
    slideSections = `  <section id="slide-1" class="slide" data-slide="1">
${landingPageContent}
  </section>

`;
}

// Add all other slides
slideSections += slides.map(slide => {
    return `  <section id="slide-${slide.index}" class="slide" data-slide="${slide.index}">
${slide.content}
  </section>`;
}).join('\n\n');

// Generate slide dots HTML (1 dot for each slide including landing page)
const slideDots = Array.from({length: totalSlides}, (_, i) => {
    const slideNum = i + 1;
    return `      <a class="slide-dot${slideNum === 1 ? ' active' : ''}" href="#slide-${slideNum}" data-slide="${slideNum}"></a>`;
}).join('\n');

// Extract title for the page
const titleMatch = chapterTitle.match(/Ch (\d+)\s*—\s*(.+)/);
const pageTitle = titleMatch ? titleMatch[2] : chapterTitle;

// Create the unified standalone HTML
const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle} — Slides</title>

    <!-- KaTeX CSS and JS -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/katex.min.css">
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/contrib/auto-render.min.js"></script>

    <style>
        /* Chapter CSS */
        ${chapterCss}

        /* Slides CSS */
        ${slidesCss}

        /* Single-page slide show/hide logic */
        .slide {
            display: none;
        }

        .slide.active {
            display: block;
        }
    </style>
</head>
<body>

<div class="slide-progress" id="slide-progress" style="width:${(100 / totalSlides).toFixed(1)}%"></div>

<div class="slide-header">
  <span class="spacer"></span>
  <span class="chapter-title">${chapterTitle}</span>
  <span class="slide-badge" id="slide-badge">1 / ${totalSlides}</span>
</div>

<div class="slide-container">
  <div class="slide-content" id="slide-content">
${slideSections}
  </div>
</div>

<nav class="slide-nav">
  <a id="prev-btn" class="nav-btn disabled">&#8592; Prev</a>
  <div class="slide-dots" id="slide-dots">
${slideDots}
  </div>
  <a id="next-btn" href="#slide-2" class="nav-btn">Next &#8594;</a>
</nav>

<script>
const totalSlides = ${totalSlides};
let currentSlide = 1;

// KaTeX rendering
document.addEventListener("DOMContentLoaded", function() {
  renderMathInElement(document.body, {
    delimiters: [
      {left: "$$", right: "$$", display: true},
      {left: "$", right: "$", display: false}
    ],
    throwOnError: false,
    trust: true
  });
});

// Get slide number from hash
function getSlideFromHash() {
  const hash = window.location.hash;
  if (hash.startsWith('#slide-')) {
    const num = parseInt(hash.replace('#slide-', ''));
    if (num >= 1 && num <= totalSlides) {
      return num;
    }
  }
  return 1;
}

// Show the specified slide
function showSlide(slideNum) {
  if (slideNum < 1 || slideNum > totalSlides) return;

  currentSlide = slideNum;

  // Hide all slides
  document.querySelectorAll('.slide').forEach(slide => {
    slide.classList.remove('active');
  });

  // Show current slide
  const currentSlideEl = document.getElementById(\`slide-\${currentSlide}\`);
  if (currentSlideEl) {
    currentSlideEl.classList.add('active');
  }

  // Update progress bar
  const progress = (currentSlide / totalSlides) * 100;
  document.getElementById('slide-progress').style.width = progress + '%';

  // Update badge
  document.getElementById('slide-badge').textContent = \`\${currentSlide} / \${totalSlides}\`;

  // Update prev/next buttons
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  if (currentSlide === 1) {
    prevBtn.classList.add('disabled');
    prevBtn.removeAttribute('href');
  } else {
    prevBtn.classList.remove('disabled');
    prevBtn.href = \`#slide-\${currentSlide - 1}\`;
  }

  if (currentSlide === totalSlides) {
    nextBtn.textContent = '↻ Start Over';
    nextBtn.href = '#slide-1';
  } else {
    nextBtn.textContent = 'Next →';
    nextBtn.href = \`#slide-\${currentSlide + 1}\`;
  }

  // Update slide dots
  document.querySelectorAll('.slide-dot').forEach((dot, index) => {
    if (index + 1 === currentSlide) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

// Handle hash changes
window.addEventListener('hashchange', function() {
  const slideNum = getSlideFromHash();
  showSlide(slideNum);
});

// Handle page load
window.addEventListener('load', function() {
  const slideNum = getSlideFromHash();
  showSlide(slideNum);
});

// Keyboard navigation
document.addEventListener('keydown', function(e) {
  if (e.key === 'ArrowLeft' && currentSlide > 1) {
    window.location.hash = \`#slide-\${currentSlide - 1}\`;
  } else if (e.key === 'ArrowRight' && currentSlide < totalSlides) {
    window.location.hash = \`#slide-\${currentSlide + 1}\`;
  } else if (e.key === 'ArrowRight' && currentSlide === totalSlides) {
    window.location.hash = '#slide-1';
  }
});

// Touch/swipe navigation
(function() {
  let sx, sy;
  document.addEventListener('touchstart', function(e) {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, {passive: true});

  document.addEventListener('touchend', function(e) {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;

    // Horizontal swipe detection
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && currentSlide < totalSlides) {
        // Swipe left - go to next
        window.location.hash = \`#slide-\${currentSlide + 1}\`;
      } else if (dx < 0 && currentSlide === totalSlides) {
        // Swipe left on last slide - start over
        window.location.hash = '#slide-1';
      } else if (dx > 0 && currentSlide > 1) {
        // Swipe right - go to previous
        window.location.hash = \`#slide-\${currentSlide - 1}\`;
      }
    }
  }, {passive: true});
})();
</script>

</body>
</html>`;

// Write the standalone HTML file
const outputPath = path.join(buildDir, `${chapterName}_standalone.html`);
fs.writeFileSync(outputPath, html);

console.log(`✅ Build complete!`);
console.log(`   Output: ${outputPath}`);
console.log(`   Chapter: ${chapterTitle}`);
console.log(`   Total slides: ${totalSlides}${landingPageContent ? ' (1 landing page + ' + slides.length + ' content slides)' : ''}`);
console.log(`   This standalone HTML includes:`);
console.log(`   - Chapter landing page as slide 1 with functional navigation links`);
console.log(`   - All ${totalSlides} slides with hash-based navigation`);
console.log(`   - Inlined CSS (chapter + slides)`);
console.log(`   - KaTeX math rendering (CDN)`);
console.log(`   - Keyboard navigation (arrow keys)`);
console.log(`   - Touch/swipe navigation`);
console.log(`   - Progress bar and slide counter`);
