// ロゴ（ふきだし×おむすび）からアプリ用アイコン PNG を生成する
//   node scripts/gen-icons.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const MARK = `
<defs><clipPath id="r"><path d="M32 13c3 0 5 1.5 6.6 4l10 17.3c2.5 4.4-.2 10.7-6.2 11.2-3.4.3-6.9.5-10.4.5s-7-.2-10.4-.5c-6-.5-8.7-6.8-6.2-11.2l10-17.3C27 14.5 29 13 32 13z"/></clipPath></defs>
<path d="M14 6h36a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H26l-11 8 2-8h-3A10 10 0 0 1 4 42V16A10 10 0 0 1 14 6z" fill="#F08A4B"/>
<path d="M32 13c3 0 5 1.5 6.6 4l10 17.3c2.5 4.4-.2 10.7-6.2 11.2-3.4.3-6.9.5-10.4.5s-7-.2-10.4-.5c-6-.5-8.7-6.8-6.2-11.2l10-17.3C27 14.5 29 13 32 13z" fill="#fff"/>
<g clip-path="url(#r)"><rect x="23" y="36" width="18" height="12" rx="2" fill="#2F4A36"/></g>
<circle cx="27.5" cy="28" r="1.8" fill="#3B2A20"/><circle cx="36.5" cy="28" r="1.8" fill="#3B2A20"/>
<path d="M30 31.5c1.2 1.3 2.8 1.3 4 0" fill="none" stroke="#3B2A20" stroke-width="1.4" stroke-linecap="round"/>`;

// scale: マークがキャンバスに占める割合（maskable は安全領域 80% の内側に収める）
const icon = (scale, rounded) => {
  const s = 64 * scale;
  const off = (64 - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" ${rounded ? 'rx="14"' : ""} fill="#FFF8F1"/>
    <g transform="translate(${off} ${off + s * 0.04}) scale(${scale})">${MARK}</g>
  </svg>`;
};

const out = [
  ["icon-192.png", 192, icon(0.78, false)],
  ["icon-512.png", 512, icon(0.78, false)],
  ["icon-maskable-512.png", 512, icon(0.6, false)],
  ["apple-touch-icon.png", 180, icon(0.78, false)],
];
for (const [name, size, svg] of out) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), png);
  console.log(name, size, png.length, "bytes");
}
