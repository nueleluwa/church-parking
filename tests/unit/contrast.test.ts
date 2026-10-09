import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Reads the real theme file, so changing a colour there is checked here.
const css = readFileSync("app/globals.css", "utf8");
const colour = (name: string): string => {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`No colour named ${name} in globals.css`);
  return m[1];
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG AA for normal text is 4.5. Pass and scanner screens must meet it.
const pairs: [string, string, string][] = [
  ["ink", "page", "body text on the page"],
  ["ink", "card", "body text on cards"],
  ["ink-soft", "card", "quiet text on cards"],
  ["ink-soft", "page", "quiet text on the page"],
  ["ink-soft", "panel", "quiet text on stone panels"],
  ["card", "action", "white text on the main button"],
  ["card", "action-dark", "white text on the hovered button"],
  ["ink", "blush", "text on the pale red selected state"],
  ["card", "night", "white text on the header and VALID banner"],
  ["card", "night-soft", "white text on the staff tab bar"],
  ["danger", "card", "error text on cards"],
  ["danger", "page", "error text on the page"],
  ["card", "danger", "white text on the red warning bar"],
  ["accent", "card", "red link text on cards"],
  ["accent", "page", "red link text on the page"],
  ["ink", "panel", "text on stone panels"],
];

describe("colour contrast (WCAG AA, 4.5:1)", () => {
  test.each(pairs)("%s on %s: %s", (fg, bg) => {
    expect(ratio(colour(fg), colour(bg))).toBeGreaterThanOrEqual(4.5);
  });

  test("the pale red selected state is separated from white by a dark border", () => {
    // The tint alone is too faint on white, so it is always used with the dark edge colour and a tick.
    expect(ratio(colour("blush"), colour("card"))).toBeLessThan(3);
    expect(ratio(colour("edge"), colour("card"))).toBeGreaterThanOrEqual(3);
    expect(ratio(colour("edge"), colour("blush"))).toBeGreaterThanOrEqual(3);
  });
});
