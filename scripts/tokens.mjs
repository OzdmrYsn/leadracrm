// replica/design/tokens.json → src/styles/tokens.css
// Çalıştır: npm run tokens
// Token'lar tek yerde durur; renk, yazı, köşe ve gölge değerleri bileşenlere buradan akar.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "replica/design/tokens.json");
const target = resolve(root, "src/styles/tokens.css");
const t = JSON.parse(readFileSync(source, "utf8"));

const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([key, value]) =>
    typeof value === "string" ? [[prefix + key, value]] : flatten(value, `${prefix}${key}-`),
  );

const colors = flatten(t.color);
// Tailwind sınıf adları: text-text yerine text-fg, text-text-muted yerine text-muted.
const utilityName = { text: "fg", "text-muted": "muted" };
const rem = (px) => `${px / 16}rem`;

const out = [
  "/* ÜRETİLEN DOSYA — elle düzenlemeyin.",
  "   Kaynak: replica/design/tokens.json · Üretmek için: npm run tokens */",
  "",
  ":root {",
  ...colors.map(([name, value]) => `  --${name}: ${value};`),
  `  --overlay: ${t.overlay};`,
  ...Object.entries(t.motion).map(([name, value]) => `  --motion-${name}: ${value};`),
  ...Object.entries(t.layout).map(([name, value]) => `  --layout-${name}: ${value}px;`),
  "}",
  "",
  "/* Renkler: Tailwind sınıfları rol değişkenlerine bağlanır. Varsayılan palet kapalıdır. */",
  "@theme inline {",
  "  --color-*: initial;",
  ...colors.map(([name]) => `  --color-${utilityName[name] ?? name}: var(--${name});`),
  "  --color-overlay: var(--overlay);",
  "}",
  "",
  "/* Yazı, köşe, gölge, hareket: yalnız token'daki basamaklar kullanılabilir. */",
  "@theme static {",
  `  --font-sans: ${t.font.sans};`,
  `  --font-mono: ${t.font.mono};`,
  `  --font-display: ${t.font.display};`,
  "",
  "  --text-*: initial;",
  ...Object.entries(t.type).flatMap(([name, v]) => [
    `  --text-${name}: ${rem(v.size)};`,
    `  --text-${name}--line-height: ${rem(v.line)};`,
    `  --text-${name}--font-weight: ${v.weight};`,
  ]),
  "",
  "  --radius-*: initial;",
  ...Object.entries(t.radius).map(([name, v]) => `  --radius-${name}: ${v}px;`),
  "",
  "  --shadow-*: initial;",
  ...Object.entries(t.shadow).map(([name, v]) => `  --shadow-${name}: ${v};`),
  "",
  "  --ease-*: initial;",
  `  --ease-soft: ${t.motion.ease};`,
  `  --default-transition-duration: ${t.motion.fast};`,
  `  --default-transition-timing-function: ${t.motion.ease};`,
  "}",
  "",
];

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, out.join("\n"));
console.log(`tokens: ${colors.length} renk, ${Object.keys(t.type).length} yazı basamağı → ${target.replace(root + "/", "")}`);
