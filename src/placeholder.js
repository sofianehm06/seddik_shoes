// Illustrations SVG utilisées tant qu'un produit n'a pas de vraie photo.
const COLORS = {
  noir: '#1f2937', blanc: '#e5e7eb', gris: '#9ca3af', marron: '#7c4a2d', camel: '#c08a4f',
  beige: '#d6c3a5', bleu: '#2563eb', marine: '#1e3a8a', rouge: '#dc2626', rose: '#ec4899',
  vert: '#16a34a', kaki: '#6b7a3a', jaune: '#eab308', orange: '#ea580c', violet: '#7c3aed',
  dore: '#c9a227', argent: '#a8b0bb', multicolore: '#0ea5e9',
};

const SHAPES = {
  sneaker: `<path d="M40 150 C40 120 60 95 90 92 L130 90 C150 70 170 60 190 62 C215 64 225 90 250 105 C285 112 320 118 340 140 C350 152 348 165 335 168 L60 170 C48 170 40 162 40 150 Z" fill="C"/>
    <path d="M40 160 L345 160 C346 170 340 178 330 178 L55 178 C45 178 40 172 40 160 Z" fill="#f8fafc" stroke="#cbd5e1"/>
    <path d="M150 85 L205 120 M165 77 L218 112 M180 70 L230 103" stroke="#f8fafc" stroke-width="5" stroke-linecap="round"/>`,
  sandal: `<path d="M50 160 C50 145 70 138 120 138 L310 138 C340 138 352 148 350 160 C348 172 335 176 310 176 L80 176 C60 176 50 170 50 160 Z" fill="#d6c3a5" stroke="#a8936f"/>
    <path d="M120 140 C130 95 175 85 205 140" fill="none" stroke="C" stroke-width="16" stroke-linecap="round"/>
    <path d="M220 140 C235 100 285 100 300 140" fill="none" stroke="C" stroke-width="16" stroke-linecap="round"/>`,
  slide: `<path d="M50 160 C50 145 70 138 120 138 L310 138 C340 138 352 148 350 160 C348 172 335 176 310 176 L80 176 C60 176 50 170 50 160 Z" fill="#334155"/>
    <path d="M150 142 C150 100 280 95 300 142 Z" fill="C"/>`,
  boot: `<path d="M120 40 L210 40 L215 120 C260 125 320 130 340 150 C350 160 345 172 330 172 L110 172 C100 172 95 165 98 155 Z" fill="C"/>
    <path d="M95 160 L345 160 C346 170 340 180 330 180 L105 180 C98 180 95 172 95 160 Z" fill="#1f2937"/>`,
  heel: `<path d="M60 90 C80 85 95 100 120 120 C170 150 250 150 330 150 C350 150 352 168 335 170 L140 170 C110 170 90 140 75 120 L70 175 L58 175 Z" fill="C"/>`,
  loafer: `<path d="M45 150 C45 125 80 110 130 108 C180 104 210 102 250 112 C300 122 340 130 348 150 C352 165 340 172 325 172 L60 172 C50 172 45 162 45 150 Z" fill="C"/>
    <path d="M45 162 L350 162 C350 172 342 180 330 180 L58 180 C48 180 45 172 45 162 Z" fill="#3f2a1d"/>
    <path d="M200 112 C220 118 250 118 270 120" stroke="#fde68a" stroke-width="5" fill="none"/>`,
  sock: `<path d="M150 30 L230 30 L230 120 C260 120 320 125 335 150 C345 168 330 180 310 180 L170 180 C150 180 145 160 150 140 Z" fill="C"/>
    <path d="M150 30 L230 30 L230 55 L150 55 Z" fill="#f8fafc" opacity=".6"/>`,
  slipper: `<path d="M50 150 C50 120 100 112 170 112 C240 112 330 120 345 150 C352 168 335 176 310 176 L80 176 C60 176 50 168 50 150 Z" fill="C"/>
    <path d="M60 158 L340 158" stroke="#f8fafc" stroke-width="4" stroke-dasharray="6 8"/>`,
};

const CATEGORY_SHAPE = {
  baskets: 'sneaker', sport: 'sneaker', 'chaussures-ville': 'loafer', mocassins: 'loafer',
  sandales: 'sandal', tongs: 'sandal', claquettes: 'slide', bottes: 'boot', escarpins: 'heel',
  ballerines: 'slipper', pantoufles: 'slipper', accessoires: 'sock',
};

function colorHex(name) {
  const key = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[\s/,]+/)[0];
  return COLORS[key] || '#475569';
}

function placeholderSvg(category, color) {
  const shape = SHAPES[CATEGORY_SHAPE[category] || 'sneaker'].replaceAll('"C"', `"${colorHex(color)}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -90 400 400"><rect y="-90" width="400" height="400" fill="#f1f5f9"/><ellipse cx="200" cy="188" rx="160" ry="10" fill="#e2e8f0"/>${shape}</svg>`;
}

module.exports = { placeholderSvg, colorHex };
