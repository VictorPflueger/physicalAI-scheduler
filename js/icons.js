// Static inline SVG icons (24×24, stroke-based). Only these constant strings are ever injected as markup.

const P = {
  play: '<path d="M7 5v14l11-7z"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  radar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.5 3.9 5.3 3.9 8.5s-1.3 6-3.9 8.5c-2.6-2.5-3.9-5.3-3.9-8.5s1.3-6 3.9-8.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.7v.3"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  memo: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14.5 3.5V8H19M9 12h7M9 15.5h7"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5V5.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3"/>',
  chevronDown: '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>',
  chevronUp: '<path d="M6.5 14.5L12 9l5.5 5.5"/>',
  chevronRight: '<path d="M9.5 6.5l5.5 5.5-5.5 5.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M4 4l16 16M10.2 6a9.6 9.6 0 0 1 1.8-.2c6 0 9.5 6.2 9.5 6.2a16 16 0 0 1-2.6 3.4M6.6 7.4C4 9.2 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.2-1"/>',
  pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  linkedin: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5v6M8 7.6v.3M11.5 16.5v-6M11.5 13.2c0-1.7 1-2.7 2.4-2.7s2.1 1 2.1 2.7v3.3"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/>',
  spark: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M18.5 15.5l.8 2 2 .7-2 .8-.8 2-.7-2-2-.8 2-.7z"/>',
  list: '<path d="M8.5 7h11M8.5 12h11M8.5 17h11"/><circle cx="4.8" cy="7" r=".9"/><circle cx="4.8" cy="12" r=".9"/><circle cx="4.8" cy="17" r=".9"/>',
  // An announcement, passengers, a clock, a timetable, a hand (a value kept by hand) and the
  // translation between two timetables (the logo's idea).
  megaphone: '<path d="M4 10v4h3l7 4V6l-7 4z"/><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5M7 14l1.5 5.5h2.5L10 15"/>',
  users: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.3" r="2.4"/><path d="M15.6 14.2c2.4-.3 4.4 1.2 4.9 4.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  translate: '<path d="M4 7.5h10M4 7.5l3-3M4 7.5l3 3M20 16.5H10M20 16.5l-3-3M20 16.5l-3 3"/>',
  timetable: '<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  hand: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-1.5-2.5a1.4 1.4 0 0 1 2.3-1.5L8 13.5"/>',
  shield: '<path d="M12 3.5l7.5 3v5.5c0 4.5-3.2 7.6-7.5 8.5-4.3-.9-7.5-4-7.5-8.5V6.5z"/>'
};

/** Returns SVG markup for an icon name (static, trusted). */
function iconSvg(name, size = 20) {
  const body = P[name] || P.info;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** A <span class="icon"> element containing the icon. */
export function icon(name, size = 20, cls = "") {
  const span = document.createElement("span");
  span.className = `icon ${cls}`.trim();
  span.innerHTML = iconSvg(name, size);
  return span;
}
