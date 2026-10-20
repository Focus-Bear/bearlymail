/* eslint-disable max-lines */
export const LANDING_STYLES = `
.bearlymail-landing {
  --cream: #FFFCF6;
  --cream-2: #FCF8F0;
  --cream-3: #F5F0E8;
  --ink: #0B0B0B;
  --dark: #2B2219;
  --dark-2: #3A2E22;
  --ink-2: #333333;
  --ink-3: #666666;
  --ink-4: #999999;
  --line: #EFE8E0;
  --line-2: #E8E0D8;
  --sun: #E9902C;
  --sun-light: #F0A859;
  --sun-pale: #FCEFE0;
  --sun-pale-2: #F9D8B3;
  /* Dark enough for small orange text to meet WCAG AA on cream and sun-pale. */
  --sun-dark: #9A560E;
  /* White CTA text needs >= 4.5:1, which the brand orange alone cannot give. */
  --sun-cta: #B35A0A;
  --sun-cta-hover: #9A4D08;
  --green: #1F8A5B;
  --red: #D84A2A;
  --warning: #F59E0B;
  --warning-light: #FEF3C7;
  --ribbon-text: #7A3E00;
  --cust: #4A2EAA;
  --prio-red: #B42318;
  /* Card and panel background; dark sections re-point it so cards stay a step above the section. */
  --surface: #fff;
  /* Text on a solid brand-orange fill. Declared here only, so it stays dark inside dark sections. */
  --on-sun: var(--ink);
  --shadow-card: 0 1px 0 rgba(11,11,11,.04), 0 24px 48px -28px rgba(11,11,11,.18);
  --shadow-soft: 0 1px 0 rgba(11,11,11,.04), 0 8px 24px -12px rgba(11,11,11,.10);
  --font-body: "Lexend", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-display: "JetBrains Mono", ui-monospace, "SF Mono", monospace;
  --highlight: var(--sun-pale-2);
  font-family: var(--font-body);
  background: var(--cream);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
.bearlymail-landing * { box-sizing: border-box; }
.bearlymail-landing { overflow-x: clip; max-width: 100vw; }
.bearlymail-landing .hero-grid > *,
.bearlymail-landing .steps > *,
.bearlymail-landing .problems > *,
.bearlymail-landing .compare-stage > *,
.bearlymail-landing .faq-grid > * { min-width: 0; }
.bearlymail-landing .demo-wrap,
.bearlymail-landing .demo,
.bearlymail-landing .demo-tabs,
.bearlymail-landing .topic-group,
.bearlymail-landing .email-card,
.bearlymail-landing .email-from { max-width: 100%; min-width: 0; }
.bearlymail-landing .email-subj,
.bearlymail-landing .email-body,
.bearlymail-landing .topic-title { overflow-wrap: anywhere; word-break: break-word; }
.bearlymail-landing h1, .bearlymail-landing h2, .bearlymail-landing h3, .bearlymail-landing .brand { font-family: var(--font-display); }
.bearlymail-landing a { color: inherit; text-decoration: none; }
.bearlymail-landing button { font-family: inherit; cursor: pointer; }
.bearlymail-landing ::selection { background: var(--sun); color: var(--cream); }

.bearlymail-landing .wrap { max-width: 1240px; margin: 0 auto; padding: 0 32px; }
@media (max-width: 720px) { .bearlymail-landing .wrap { padding: 0 20px; } }

.bearlymail-landing header.site {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--cream) 88%, transparent);
  backdrop-filter: saturate(140%) blur(10px);
  border-bottom: 1px solid var(--line);
}
.bearlymail-landing header.site .row {
  height: 68px;
  display: flex; align-items: center; justify-content: space-between;
}
.bearlymail-landing .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: -0.01em; font-size: 17px; }
.bearlymail-landing .brand-mark {
  width: 32px; height: 32px;
  display: grid; place-items: center;
}
.bearlymail-landing .brand-mark img { width: 32px; height: 32px; display: block; }
.bearlymail-landing .nav { display: flex; align-items: center; gap: 28px; font-size: 14px; color: var(--ink-2); }
.bearlymail-landing .nav a:hover { color: var(--ink); }
.bearlymail-landing .nav-cta { display: flex; align-items: center; gap: 12px; }
.bearlymail-landing .btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; padding: 0 16px; border-radius: 10px;
  font-size: 14px; font-weight: 600; letter-spacing: -0.005em;
  border: 1px solid transparent; transition: transform .12s ease, background .12s ease, border-color .12s ease, color .12s ease;
}
.bearlymail-landing .btn:active { transform: translateY(1px); }
.bearlymail-landing .btn-ghost { color: var(--ink-2); background: transparent; border-color: transparent; }
.bearlymail-landing .btn-ghost:hover { color: var(--ink); background: var(--cream-2); }
.bearlymail-landing .btn-outline { color: var(--ink); background: transparent; border-color: var(--ink); }
.bearlymail-landing .btn-outline:hover { background: var(--ink); color: var(--cream); }
.bearlymail-landing .btn-primary { color: var(--cream); background: var(--ink); border-color: var(--ink); }
.bearlymail-landing .btn-primary:hover { background: #1f1f1f; }
.bearlymail-landing .btn-sun { color: #fff; background: var(--sun-cta); border-color: var(--sun-cta); box-shadow: inset 0 -1px 0 rgba(0,0,0,.12); }
.bearlymail-landing .btn-sun:hover { background: var(--sun-cta-hover); border-color: var(--sun-cta-hover); }
.bearlymail-landing .btn-lg { height: 52px; padding: 0 22px; font-size: 15px; border-radius: 12px; }

.bearlymail-landing .hero { padding: 64px 0 24px; }
.bearlymail-landing .hero-grid {
  display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 80px; align-items: center;
}
@media (max-width: 980px) {
  .bearlymail-landing .hero-grid { grid-template-columns: 1fr; gap: 56px; }
}
.bearlymail-landing .eyebrow {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: var(--font-display); color: var(--ink-2);
  font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
}
.bearlymail-landing .eyebrow::before { content: ""; width: 24px; height: 2px; background: var(--ink); }
.bearlymail-landing h1.display {
  font-size: clamp(38px, 4.2vw, 56px);
  line-height: 1.08; letter-spacing: -0.04em;
  font-weight: 700; margin: 24px 0 0;
  text-wrap: balance;
}
.bearlymail-landing h1.display em { font-style: normal; color: inherit; background: linear-gradient(transparent 60%, var(--highlight) 60%); padding: 0 .06em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.bearlymail-landing .lead {
  font-size: 19px; line-height: 1.6; color: var(--ink-2);
  margin: 22px 0 32px; max-width: 540px; text-wrap: pretty;
}
.bearlymail-landing .hero-cta { display: flex; }
.bearlymail-landing .hero-benefits {
  list-style: none; padding: 0; margin: 22px 0 0;
  display: flex; flex-wrap: wrap; gap: 10px 22px;
  font-size: 15px; color: var(--ink-2); font-weight: 600;
}
.bearlymail-landing .hero-benefits li { display: inline-flex; align-items: center; gap: 8px; }
.bearlymail-landing .hero-benefits .check {
  width: 20px; height: 20px; border-radius: 999px; flex: none;
  display: inline-grid; place-items: center;
  background: var(--sun-pale); color: var(--sun-dark); font-size: 11px; font-weight: 700;
}
.bearlymail-landing .hero-built-for {
  display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px;
  margin: 28px 0 0; padding: 14px 16px; max-width: 540px;
  background: #fff; border: 1px solid var(--line-2); border-radius: 14px;
  font-size: 14.5px; line-height: 1.5; color: var(--ink-2);
}
.bearlymail-landing .built-for-badge {
  flex: none; padding: 4px 10px; border-radius: 999px;
  background: var(--ink); color: var(--cream);
  font-size: 12px; font-weight: 700; letter-spacing: 0.02em;
}

.bearlymail-landing .hero-video { margin: 0; }
.bearlymail-landing .hero-video-frame {
  position: relative; aspect-ratio: 16 / 9; width: 100%;
  border-radius: 18px; overflow: hidden;
  background: #fff; border: 1px solid var(--line-2);
  box-shadow: var(--shadow-card);
}
.bearlymail-landing .hero-video-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.bearlymail-landing .hero-video-placeholder {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  background:
    radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--sun) 16%, transparent), transparent 55%),
    linear-gradient(160deg, var(--cream-2), var(--sun-pale));
}
.bearlymail-landing .hero-video-play {
  width: 76px; height: 76px; border-radius: 999px;
  display: grid; place-items: center; padding-left: 4px;
  background: var(--sun); color: #fff;
  box-shadow: 0 0 0 10px color-mix(in srgb, var(--sun) 18%, transparent), var(--shadow-soft);
}
.bearlymail-landing .hero-video-soon { font-size: 15px; font-weight: 700; color: var(--ink-2); }
.bearlymail-landing .hero-video-caption { margin-top: 14px; text-align: center; font-size: 14px; color: var(--ink-3); }
.bearlymail-landing .demo-tab-filter { margin-left: auto; }
.bearlymail-landing .filter-box { display: inline-block; width: 14px; height: 14px; border: 1px solid var(--ink-3); border-radius: 3px; }
.bearlymail-landing .banner-emoji { color: var(--sun-dark); font-weight: 700; }
.bearlymail-landing .batch-time { margin-left: 4px; }
.bearlymail-landing .demo-mini .mini-muted { color: var(--ink-4); }
.bearlymail-landing .demo-mini .mini-accent { color: var(--sun-dark); }
.bearlymail-landing .demo-mini .mini-red { color: var(--red); }
.bearlymail-landing .visual-footer { font-size: 12px; color: var(--ink-3); padding-top: 8px; border-top: 1px dashed var(--line); }
.bearlymail-landing .visual-footer-bold { color: var(--ink); font-weight: 600; }
.bearlymail-landing .pill-muted { color: var(--ink-4); }
.bearlymail-landing .compare-recommended { margin-left: auto; padding: 3px 10px; font-family: var(--font-body); font-size: 11.5px; font-weight: 700; background: var(--sun); color: var(--ink); border-radius: 999px; }
.bearlymail-landing .founder-kicker { display: inline-block; font-size: 12px; font-weight: 600; color: var(--sun-dark); letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 16px; }
.bearlymail-landing .focus-bear-link { color: var(--sun-dark); font-weight: 600; }
.bearlymail-landing .footer-brand { font-size: 14px; }
.bearlymail-landing .footer-brand-mark { width: 24px; height: 24px; }
.bearlymail-landing .footer-brand-mark img { width: 24px; height: 24px; }

.bearlymail-landing .demo-wrap { position: relative; }
.bearlymail-landing .demo {
  position: relative;
  background: #fff;
  border: 1px solid var(--line-2);
  border-radius: 18px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
  transform: rotate(0.6deg);
}
.bearlymail-landing .demo-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, #fff, #FBF6EE);
}
.bearlymail-landing .demo-dots { display: flex; gap: 6px; }
.bearlymail-landing .demo-dots span { width: 10px; height: 10px; border-radius: 999px; background: var(--cream-3); }
.bearlymail-landing .demo-title { font-size: 12px; color: var(--ink-3); font-weight: 500; }
.bearlymail-landing .demo-clock { font-size: 12px; color: var(--ink-3); display: inline-flex; gap: 6px; align-items: center; }
.bearlymail-landing .demo-clock .live { width: 6px; height: 6px; border-radius: 999px; background: var(--green); animation: blm-pulse 1.6s ease-in-out infinite; }
@keyframes blm-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

.bearlymail-landing .demo-tabs {
  display: flex; gap: 0; padding: 10px 14px 0;
  border-bottom: 1px solid var(--line);
  background: #fff;
}
.bearlymail-landing .demo-tab {
  font-size: 12px; padding: 8px 12px; color: var(--ink-3);
  background: transparent; border: 0; border-bottom: 2px solid transparent; font-weight: 500;
  transition: color .2s ease, border-color .2s ease;
  cursor: pointer;
}
.bearlymail-landing .demo-tab.active { color: var(--ink); border-bottom-color: var(--sun); font-weight: 600; }
.bearlymail-landing .demo-tab .count { display: inline-block; margin-left: 6px; padding: 1px 6px; font-size: 10px; border-radius: 999px; background: var(--cream-3); color: var(--ink-2); transform-origin: center; transition: background .25s ease, color .25s ease; }
.bearlymail-landing .demo-tab.active .count { background: var(--sun-pale); color: var(--sun-dark); }
.bearlymail-landing .demo-tab.bump .count { animation: blm-count-bump .55s ease; }
@keyframes blm-count-bump {
  0%, 100% { transform: scale(1); }
  40% { transform: scale(1.4); background: var(--sun-pale); color: var(--sun-dark); }
}

.bearlymail-landing .demo-batch-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  background: linear-gradient(180deg, var(--sun-pale), color-mix(in srgb, var(--sun-pale) 60%, #fff));
  border-bottom: 1px solid color-mix(in srgb, var(--sun) 18%, transparent);
  font-size: 12.5px; color: var(--ink-2);
}
.bearlymail-landing .demo-batch-banner b { color: var(--ink); font-weight: 600; }
.bearlymail-landing .demo-batch-banner .timer {
  margin-left: auto; font-family: inherit;
  font-size: 11px; padding: 4px 8px; background: #fff;
  border: 1px solid color-mix(in srgb, var(--sun) 20%, transparent);
  border-radius: 6px; color: var(--ink); font-weight: 500;
}

.bearlymail-landing .topic-group { padding: 14px 14px 18px; position: relative; }
.bearlymail-landing .topic-head {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: #fff;
  border-bottom: 1px solid var(--line);
  font-size: 13px; color: var(--ink-2);
}
.bearlymail-landing .topic-head .chev { color: var(--ink-3); font-size: 11px; }
.bearlymail-landing .topic-head .topic-ic { font-size: 14px; }
.bearlymail-landing .topic-head .topic-title {
  flex: 1; min-width: 0;
  font-size: 13px; color: var(--ink-2); line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.bearlymail-landing .topic-head .topic-title b { color: var(--ink); font-weight: 600; }
.bearlymail-landing .topic-head .topic-pill {
  width: 22px; height: 22px; border-radius: 999px;
  display: grid; place-items: center;
  background: var(--cream-3); color: var(--ink-2);
  font-size: 11px; font-weight: 600;
}
.bearlymail-landing .topic-head .topic-action {
  display: inline-flex; align-items: center; gap: 4px;
  color: var(--ink-3); font-size: 12px; cursor: default;
}
@media (max-width: 1100px) { .bearlymail-landing .hide-sm { display: none; } }

.bearlymail-landing .email-card {
  margin-top: 10px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  transition: box-shadow .2s ease;
  position: relative;
  overflow: hidden;
}
.bearlymail-landing .email-card-with-ribbon { padding-top: 38px; }
.bearlymail-landing .email-card.flying { animation: blm-fly-to-tab 720ms cubic-bezier(.55,0,.4,1) forwards; pointer-events: none; }
@keyframes blm-fly-to-tab {
  0%   { transform: translate(0, 0) scale(1); opacity: 1; }
  35%  { transform: translate(calc(var(--tx, 0px) * 0.55), -40px) scale(0.94); opacity: 0.95; }
  100% { transform: translate(var(--tx, 0px), var(--ty, -180px)) scale(0.32); opacity: 0; }
}
.bearlymail-landing .email-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-bottom: 4px;
}
.bearlymail-landing .email-from { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bearlymail-landing .email-from b { font-size: 14px; color: var(--ink); font-weight: 600; }
.bearlymail-landing .email-from .unread-dot {
  width: 8px; height: 8px; border-radius: 999px; background: var(--sun); flex-shrink: 0;
}
.bearlymail-landing .email-from .sender-avatar {
  width: 28px; height: 28px; border-radius: 999px;
  display: grid; place-items: center; flex-shrink: 0;
  background: var(--sun-pale); color: var(--sun-dark);
  font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
}
.bearlymail-landing .chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 500;
  border: 1px solid var(--line);
}
.bearlymail-landing .chip-team { background: #EFEAFB; color: #4A2EAA; border-color: #E0D6F5; }
.bearlymail-landing .chip-prio { background: #FCE9CC; color: #8A4F0F; border-color: color-mix(in srgb, var(--sun) 30%, transparent); }
.bearlymail-landing .email-time { font-size: 11.5px; color: var(--ink-4); white-space: nowrap; }
.bearlymail-landing .email-subj { font-size: 13px; color: var(--ink-2); margin-bottom: 6px; }
.bearlymail-landing .email-body { font-size: 12.5px; line-height: 1.5; color: var(--ink-3); margin-bottom: 14px; }
.bearlymail-landing .email-foot {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
  padding-top: 12px; border-top: 1px dashed var(--line);
  flex-wrap: wrap;
}
.bearlymail-landing .prio-block { min-width: 0; }
.bearlymail-landing .prio-label { font-size: 11.5px; color: var(--ink-3); margin-bottom: 6px; }
.bearlymail-landing .prio-row { display: flex; gap: 6px; }
.bearlymail-landing .prio-btn {
  appearance: none; background: var(--cream-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 6px 10px 5px;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  cursor: pointer;
  transition: background .12s, border-color .12s, transform .08s;
  min-width: 56px;
  position: relative;
}
.bearlymail-landing .prio-btn:hover { background: #fff; border-color: var(--line-2); }
.bearlymail-landing .prio-btn:active { transform: translateY(1px); }
.bearlymail-landing .prio-btn.active { background: var(--sun-pale); border-color: color-mix(in srgb, var(--sun) 35%, transparent); }
.bearlymail-landing .prio-btn .emo { font-size: 18px; line-height: 1; }
.bearlymail-landing .prio-btn .emo-l { font-size: 9.5px; color: var(--ink-3); letter-spacing: -0.005em; }
.bearlymail-landing .prio-btn.active .emo-l { color: var(--sun-dark); font-weight: 600; }
.bearlymail-landing .prio-btn.pulse {
  box-shadow: 0 0 0 0 rgba(214,127,71,0.55);
  animation: blm-prio-pulse 1.9s ease-out infinite;
}
.bearlymail-landing .prio-btn.pulse::after {
  content: ""; position: absolute; inset: -3px;
  border-radius: 12px;
  border: 2px solid var(--sun);
  pointer-events: none;
  animation: blm-prio-ring 1.9s ease-out infinite;
}
@keyframes blm-prio-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(214,127,71,0.45); }
  70%  { box-shadow: 0 0 0 14px rgba(214,127,71,0); }
  100% { box-shadow: 0 0 0 0 rgba(214,127,71,0); }
}
@keyframes blm-prio-ring {
  0%   { transform: scale(1); opacity: 0.85; }
  100% { transform: scale(1.18); opacity: 0; }
}
.bearlymail-landing .prio-btn.pulse:hover { animation-play-state: paused; }
.bearlymail-landing .prio-btn.pulse:hover::after { animation-play-state: paused; opacity: 0.95; }

.bearlymail-landing .row-actions { display: flex; gap: 14px; flex-wrap: wrap; }
.bearlymail-landing .row-act { font-size: 11.5px; color: var(--ink-3); }
.bearlymail-landing button.row-act {
  appearance: none; background: transparent; border: 0; padding: 0;
  font: inherit; font-size: 11.5px; color: var(--ink-3);
  cursor: pointer; transition: color .12s;
}
.bearlymail-landing button.row-act:hover { color: var(--ink); }
.bearlymail-landing .row-act-disabled { opacity: 0.45; cursor: default; }

.bearlymail-landing .skel-row {
  display: flex; align-items: center; gap: 10px;
  margin-top: 10px; padding: 12px 18px;
  border: 1px solid var(--line); border-radius: 12px;
  background: var(--cream-2); opacity: 0.6;
}
.bearlymail-landing .skel-row .skel-avatar {
  width: 24px; height: 24px; border-radius: 999px;
  display: grid; place-items: center; flex-shrink: 0;
  background: var(--cream-3); color: var(--ink-4);
  font-size: 10px; font-weight: 700;
}
.bearlymail-landing .skel-row .skel-sender { font-size: 12.5px; font-weight: 600; color: var(--ink-3); white-space: nowrap; }
.bearlymail-landing .skel-row .skel-subj { flex: 1; min-width: 0; font-size: 12px; color: var(--ink-4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bearlymail-landing .skel-row .skel-time { font-size: 11px; color: var(--ink-4); white-space: nowrap; }

.bearlymail-landing .demo-restart {
  font-size: 11px; font-weight: 600; color: var(--ink-3);
  background: transparent; border: 1px solid var(--line);
  border-radius: 999px; padding: 3px 9px; cursor: pointer; margin-right: 4px;
  transition: color .12s, border-color .12s;
}
.bearlymail-landing .demo-restart:hover { color: var(--ink); border-color: var(--line-2); }

.bearlymail-landing .demo-foot {
  display: flex; align-items: center; gap: 10px; justify-content: space-between;
  padding: 10px 14px;
  background: var(--cream-2); border-top: 1px solid var(--line);
  font-size: 12px; color: var(--ink-3);
}
.bearlymail-landing .demo-foot .nextbatch { display: inline-flex; align-items: center; gap: 6px; }
.bearlymail-landing .demo-foot .nextbatch b { color: var(--ink); font-weight: 600; }

.bearlymail-landing .chip-float {
  position: absolute; padding: 8px 12px; background: #fff;
  border: 1px solid var(--line-2); border-radius: 12px;
  box-shadow: var(--shadow-soft);
  font-size: 12px; color: var(--ink-2); font-weight: 500;
  display: flex; align-items: center; gap: 8px;
  z-index: 2;
}
.bearlymail-landing .chip-float .ic { width: 18px; height: 18px; border-radius: 6px; display: grid; place-items: center; }
.bearlymail-landing .chip-1 { top: -22px; left: -28px; transform: rotate(-4deg); }
.bearlymail-landing .chip-1 .ic { background: var(--sun-pale); color: var(--sun-dark); }
.bearlymail-landing .chip-2 { bottom: -22px; right: -32px; transform: rotate(3deg); }
.bearlymail-landing .chip-2 .ic { background: #DCEFE5; color: var(--green); }
.bearlymail-landing .chip-try { top: -22px; left: -28px; transform: rotate(-4deg); }
.bearlymail-landing .chip-try .ic { background: var(--sun-pale); color: var(--sun-dark); }
@media (max-width: 1100px) {
  .bearlymail-landing .chip-1 { left: 8px; }
  .bearlymail-landing .chip-2 { right: 8px; }
  .bearlymail-landing .chip-try { left: 8px; }
}
@media (max-width: 520px) { .bearlymail-landing .chip-1, .bearlymail-landing .chip-2 { display: none; } }

.bearlymail-landing section { padding: 96px 0; }
@media (max-width: 720px) { .bearlymail-landing section { padding: 64px 0; } }
.bearlymail-landing .section-band { background: var(--cream-2); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.bearlymail-landing .section-dark,
.bearlymail-landing .cta-final {
  /* Re-point the light-theme tokens so every component inside reads at WCAG AA on the dark background. */
  --ink: var(--cream);
  --ink-2: #E8E0CE;
  --ink-3: #C8C2B4;
  --ink-4: #B0A898;
  --line: #4A3D30;
  --line-2: #5A4A3A;
  --surface: var(--dark-2);
  --cream-2: #45372A;
  --cream-3: #54443A;
  --sun-pale: #5A3A1C;
  --sun-dark: var(--sun-light);
  --cust: #C9B8FF;
  background: var(--dark); color: var(--ink);
}
.bearlymail-landing .section-dark h2.section-title em { color: var(--sun-light); background: none; }

.bearlymail-landing .section-head { max-width: 740px; margin: 0 auto 56px; text-align: center; }
.bearlymail-landing .section-head .kicker {
  display: inline-block; font-size: 12px; font-weight: 600;
  color: var(--sun-dark); letter-spacing: 0.14em; text-transform: uppercase;
  margin-bottom: 16px;
}
.bearlymail-landing h2.section-title {
  font-size: clamp(28px, 3.3vw, 40px);
  line-height: 1.12; letter-spacing: -0.035em;
  font-weight: 700; margin: 0;
  text-wrap: balance;
}
.bearlymail-landing h2.section-title em { font-style: normal; color: inherit; background: linear-gradient(transparent 60%, var(--highlight) 60%); padding: 0 .06em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.bearlymail-landing .section-sub {
  font-size: 17px; line-height: 1.55; color: var(--ink-2);
  margin-top: 18px; text-wrap: pretty;
}

.bearlymail-landing .problems {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: auto auto 1fr auto; column-gap: 24px; row-gap: 0;
}
@media (max-width: 880px) {
  .bearlymail-landing .problems { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; row-gap: 16px; }
}
.bearlymail-landing .problem-card {
  display: grid; grid-row: span 4; grid-template-rows: subgrid; row-gap: 0;
  /* Cap the column at the card's width; an implicit auto column grew to the widest no-wrap row and pushed the content past the padding. */
  grid-template-columns: minmax(0, 1fr);
  padding: 28px; background: #fff;
  border: 1px solid var(--line); border-radius: 16px;
}
@media (max-width: 880px) { .bearlymail-landing .problem-card { grid-row: auto; grid-template-rows: none; } }
.bearlymail-landing .problem-num {
  justify-self: start; margin-bottom: 18px;
  padding: 4px 10px; border-radius: 999px;
  background: var(--sun-pale); color: var(--sun-dark);
  font-size: 13px; font-weight: 700; letter-spacing: 0.04em;
}
.bearlymail-landing .problem-card h3 {
  font-size: 20px; line-height: 1.25; font-weight: 700; letter-spacing: -0.015em;
  margin: 0 0 10px; text-wrap: balance;
}
.bearlymail-landing .problem-card p { font-size: 15px; line-height: 1.6; color: var(--ink-3); margin: 0; }
.bearlymail-landing .problem-mini {
  display: flex; flex-direction: column; justify-content: center;
  margin-top: 22px; padding: 6px 14px;
  border-radius: 12px; background: var(--cream-2); border: 1px solid var(--line);
}
.bearlymail-landing .mini-list { list-style: none; margin: 0; padding: 0; }
.bearlymail-landing .mini-row {
  display: flex; align-items: center; gap: 8px;
  min-height: 38px; font-size: 13.5px; color: var(--ink-2);
  border-bottom: 1px solid var(--line);
}
.bearlymail-landing .mini-row:last-child { border-bottom: 0; }
/* Wrap rather than ellipsis: on a phone "Pure triage, before any real w…" lost the point of the row. */
.bearlymail-landing .mini-subject { flex: 1; min-width: 0; padding: 6px 0; line-height: 1.35; overflow-wrap: anywhere; }
.bearlymail-landing .mini-meta { color: var(--ink-3); font-size: 12.5px; white-space: nowrap; }
.bearlymail-landing .mini-value { font-weight: 700; color: var(--ink); white-space: nowrap; }
.bearlymail-landing .mini-row-buried { color: var(--ink-3); }
.bearlymail-landing .mini-row-buried .mini-subject { font-weight: 600; }
.bearlymail-landing .mini-tag {
  flex: none; padding: 2px 8px; border-radius: 999px;
  background: var(--cream-3); color: var(--ink-3); font-size: 11.5px; font-weight: 600;
}
.bearlymail-landing .mini-tag-important { background: #FBE4DE; color: #9A2C14; }
.bearlymail-landing .mini-unread { flex: none; width: 8px; height: 8px; border-radius: 999px; background: var(--sun); }
.bearlymail-landing .mini-row-total { font-weight: 600; color: var(--ink); }
.bearlymail-landing .mini-row-total .mini-value { color: #9A2C14; }

.bearlymail-landing .steps {
  display: grid; grid-template-columns: 1fr 1fr; gap: 56px;
  align-items: start;
}
@media (max-width: 980px) { .bearlymail-landing .steps { grid-template-columns: 1fr; } }
.bearlymail-landing .steps-list { display: flex; flex-direction: column; gap: 8px; }
.bearlymail-landing .step {
  padding: 24px 24px 24px 28px;
  border-radius: 14px;
  cursor: pointer; transition: background .18s ease, border-color .18s ease;
  border: 1px solid transparent; background: transparent;
  width: 100%; text-align: left; font: inherit; color: inherit;
  display: grid; grid-template-columns: 28px 1fr; gap: 18px; align-items: start;
}
.bearlymail-landing .step:hover { background: var(--cream-2); }
.bearlymail-landing .step.active { background: var(--surface); border-color: var(--line-2); box-shadow: var(--shadow-soft); }
.bearlymail-landing .step .n {
  font-size: 13px; font-weight: 700; color: var(--ink-4);
  padding-top: 3px;
}
.bearlymail-landing .step.active .n { color: var(--sun-dark); }
.bearlymail-landing .step h3 { margin: 0 0 6px; font-size: 18px; font-weight: 600; letter-spacing: -0.005em; }
.bearlymail-landing .step p { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--ink-3); }

.bearlymail-landing .step-visual {
  position: sticky; top: 96px;
  background: var(--surface);
  border: 1px solid var(--line-2);
  border-radius: 18px;
  padding: 28px;
  min-height: 380px;
  box-shadow: var(--shadow-soft);
  display: flex; flex-direction: column; gap: 16px;
}
.bearlymail-landing .visual-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; color: var(--ink-3);
}
.bearlymail-landing .visual-head b { color: var(--ink); font-weight: 600; font-size: 13px; }
.bearlymail-landing .visual-tag {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 999px;
  background: var(--sun-pale); color: var(--sun-dark);
  font-size: 11px; font-weight: 600;
}
.bearlymail-landing .schedule-grid {
  display: grid; grid-template-columns: 60px 1fr; gap: 12px;
  align-items: center;
}
.bearlymail-landing .schedule-grid .time { font-family: inherit; font-size: 12px; color: var(--ink-3); text-align: right; }
.bearlymail-landing .schedule-grid .now { color: var(--sun-dark); font-weight: 600; }
.bearlymail-landing .schedule-grid .lane {
  height: 40px; border-radius: 8px;
  background: var(--cream-2); position: relative;
  border: 1px dashed var(--line-2);
  display: flex; align-items: center; padding: 0 10px;
  font-size: 12px; color: var(--ink-3);
}
.bearlymail-landing .schedule-grid .lane.delivered {
  background: linear-gradient(90deg, var(--sun-pale), color-mix(in srgb, var(--sun-pale) 50%, var(--surface)));
  border: 1px solid color-mix(in srgb, var(--sun) 25%, transparent);
  color: var(--sun-dark); font-weight: 500;
}
.bearlymail-landing .schedule-grid .lane.delivered b { color: var(--sun-dark); }
.bearlymail-landing .schedule-grid .lane .pill { margin-left: auto; font-size: 10.5px; font-family: inherit; }
.bearlymail-landing .schedule-grid .lane.quiet { background: repeating-linear-gradient(135deg, var(--cream-2), var(--cream-2) 6px, var(--cream-3) 6px, var(--cream-3) 7px); color: var(--ink-4); }

.bearlymail-landing .score-list { display: flex; flex-direction: column; gap: 10px; }
.bearlymail-landing .score-row {
  display: grid; grid-template-columns: 1fr 60px 80px; gap: 12px; align-items: center;
  padding: 8px 4px; border-bottom: 1px dashed var(--line);
}
.bearlymail-landing .score-row:last-child { border-bottom: none; }
.bearlymail-landing .score-row .label { font-size: 13px; }
.bearlymail-landing .score-row .label small { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--ink-3); font-size: 11.5px; margin-top: 4px; }
.bearlymail-landing .score-cat {
  padding: 1px 7px; border-radius: 999px;
  background: color-mix(in srgb, var(--cust) 10%, var(--surface)); color: var(--cust);
  font-size: 11px; font-weight: 600;
}
.bearlymail-landing .score-row .score { font-family: inherit; font-size: 12px; color: var(--ink-2); text-align: right; }
.bearlymail-landing .score-row .meter { height: 6px; border-radius: 999px; background: var(--cream-3); overflow: hidden; }
.bearlymail-landing .score-row .meter i { display: block; height: 100%; background: linear-gradient(90deg, var(--sun-light), var(--sun)); }
.bearlymail-landing .score-row.high .score { color: var(--sun-dark); font-weight: 600; }

.bearlymail-landing .urgent-flow { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }
.bearlymail-landing .urgent-row {
  display: grid; grid-template-columns: 24px 1fr auto; gap: 10px; align-items: center;
  padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream-2);
  font-size: 13px; color: var(--ink-2);
}
.bearlymail-landing .urgent-row.match { background: linear-gradient(90deg, var(--sun-pale), var(--surface)); border-color: color-mix(in srgb, var(--sun) 25%, transparent); }
.bearlymail-landing .urgent-row .ic { width: 20px; height: 20px; border-radius: 6px; background: var(--cream-3); display: grid; place-items: center; font-size: 11px; font-weight: 600; color: var(--ink-3); }
.bearlymail-landing .urgent-row.match .ic { background: var(--sun); color: var(--on-sun); }
.bearlymail-landing .urgent-row .out { font-family: inherit; font-size: 11px; color: var(--ink-3); }
.bearlymail-landing .urgent-row.match .out { color: var(--sun-dark); font-weight: 600; }

.bearlymail-landing .compare-stage {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  align-items: stretch;
}
@media (max-width: 880px) { .bearlymail-landing .compare-stage { grid-template-columns: 1fr; } }
.bearlymail-landing .compare-card {
  background: #fff; border: 1px solid var(--line);
  border-radius: 16px; padding: 28px;
  display: flex; flex-direction: column;
}
.bearlymail-landing .compare-card.us {
  background: #fff;
  border: 2px solid var(--sun);
  transform: translateY(-12px);
  box-shadow: 0 0 0 6px var(--sun-pale), var(--shadow-card);
}
@media (max-width: 880px) { .bearlymail-landing .compare-card.us { transform: none; } }
.bearlymail-landing .compare-card .name {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--font-display);
  font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
  padding-bottom: 16px; margin-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.bearlymail-landing .compare-card .logo {
  width: 28px; height: 28px; border-radius: 8px;
  display: grid; place-items: center; font-size: 13px; font-weight: 700;
}
.bearlymail-landing .logo-bm { background: var(--sun); color: var(--ink); }
.bearlymail-landing .logo-sh { background: var(--cream-2); color: var(--ink); border: 1px solid var(--line-2); }
.bearlymail-landing .logo-gm { background: var(--cream-2); color: var(--ink); border: 1px solid var(--line-2); }
.bearlymail-landing .compare-card .ask {
  font-size: 15px; line-height: 1.45; font-weight: 600;
  margin-bottom: 20px; color: var(--ink-2);
}
.bearlymail-landing .compare-card.us .ask { color: var(--ink); }
.bearlymail-landing .compare-row {
  display: grid; grid-template-columns: 96px 1fr; gap: 12px;
  padding: 12px 0; border-top: 1px solid var(--line);
  font-size: 14px; line-height: 1.45;
}
.bearlymail-landing .compare-row .k { color: var(--ink-3); font-weight: 600; }
.bearlymail-landing .compare-row .v { color: var(--ink-2); }
.bearlymail-landing .compare-card.us .compare-row .v { color: var(--ink); font-weight: 600; }
.bearlymail-landing .compare-row .v .ck { color: var(--green); font-weight: 700; }
.bearlymail-landing .compare-row .v .x { color: #9A6B3E; font-weight: 700; }
.bearlymail-landing .compare-card .price {
  margin-top: auto; padding-top: 22px;
  font-size: 13.5px; color: var(--ink-3);
}
.bearlymail-landing .compare-card .price b { color: var(--ink); font-size: 17px; font-family: var(--font-display); }
.bearlymail-landing .compare-note {
  max-width: 880px; margin: 40px auto 0; padding: 20px 24px;
  background: #fff; border: 1px solid var(--line-2); border-left: 4px solid var(--sun); border-radius: 14px;
}
.bearlymail-landing .compare-note b { font-family: var(--font-display); font-size: 17px; color: var(--ink); }
.bearlymail-landing .compare-note p { margin: 6px 0 0; font-size: 15px; line-height: 1.6; color: var(--ink-2); }

.bearlymail-landing .why-not-claude-body { max-width: 680px; margin: 0 auto; }
.bearlymail-landing .why-not-claude-body p { margin: 0 0 18px; font-size: 18px; line-height: 1.65; color: var(--ink-2); text-wrap: pretty; }
.bearlymail-landing .why-not-claude-body p:last-child { margin-bottom: 0; color: var(--ink); font-weight: 500; }

.bearlymail-landing .founder-band { padding: 120px 0; }
.bearlymail-landing .founder {
  display: grid; grid-template-columns: 200px 1fr; gap: 56px;
  align-items: start;
}
@media (max-width: 720px) { .bearlymail-landing .founder { grid-template-columns: 1fr; gap: 24px; } }
.bearlymail-landing .founder .portrait {
  width: 200px; height: 200px; border-radius: 24px;
  border: 1px solid var(--line-2);
  overflow: hidden; position: relative;
  background: var(--cream-2);
}
.bearlymail-landing .founder .portrait img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.bearlymail-landing .founder blockquote {
  margin: 0;
  font-family: var(--font-display); font-weight: 500;
  font-size: clamp(26px, 3vw, 38px);
  line-height: 1.25; letter-spacing: -0.02em;
  color: var(--ink); text-wrap: balance;
}
.bearlymail-landing .founder blockquote .accent { color: var(--sun-dark); }
.bearlymail-landing .founder .who {
  margin-top: 28px; font-size: 14px; color: var(--ink-3);
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}
.bearlymail-landing .founder .who b { color: var(--ink); font-weight: 600; }
.bearlymail-landing .founder .who .sep { width: 4px; height: 4px; border-radius: 999px; background: var(--ink-4); }
.bearlymail-landing .founder details {
  margin-top: 32px;
  border-top: 1px solid var(--line); padding-top: 24px;
}
.bearlymail-landing .founder details summary {
  cursor: pointer; font-size: 13px; color: var(--sun-dark);
  font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  list-style: none; display: inline-flex; align-items: center; gap: 8px;
}
.bearlymail-landing .founder details summary::-webkit-details-marker { display: none; }
.bearlymail-landing .founder details summary::after { content: "→"; transition: transform .2s ease; }
.bearlymail-landing .founder details[open] summary::after { transform: rotate(90deg); }
.bearlymail-landing .founder details p {
  font-size: 15px; line-height: 1.65; color: var(--ink-2);
  max-width: 640px; margin: 16px 0 0;
}
.bearlymail-landing .founder details p + p { margin-top: 14px; }

.bearlymail-landing .faq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-width: 880px; margin: 0 auto; }
@media (max-width: 720px) { .bearlymail-landing .faq-grid { grid-template-columns: 1fr; } }
.bearlymail-landing .faq-item {
  padding: 22px 24px;
  background: #fff; border: 1px solid var(--line); border-radius: 14px;
}
.bearlymail-landing .faq-item summary {
  cursor: pointer; list-style: none; font-weight: 600; font-size: 15px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.bearlymail-landing .faq-item summary::-webkit-details-marker { display: none; }
.bearlymail-landing .faq-item summary::after { content: "+"; color: var(--ink-4); font-weight: 400; font-size: 22px; line-height: 1; transition: transform .18s ease; }
.bearlymail-landing .faq-item[open] summary::after { transform: rotate(45deg); }
.bearlymail-landing .faq-item p { margin: 12px 0 0; font-size: 14px; line-height: 1.55; color: var(--ink-3); }

.bearlymail-landing .cta-final {
  padding: 96px 0;
  position: relative; overflow: hidden;
}
.bearlymail-landing .cta-final::before {
  content: ""; position: absolute; inset: -40% -10% auto auto;
  width: 520px; height: 520px; border-radius: 999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--sun) 28%, transparent), transparent 60%);
  pointer-events: none;
}
.bearlymail-landing .cta-final .inner { max-width: 760px; margin: 0 auto; text-align: center; position: relative; }
.bearlymail-landing .cta-final h2 {
  font-size: clamp(36px, 5vw, 64px);
  line-height: 1.0; letter-spacing: -0.03em; font-weight: 700;
  margin: 0 0 16px;
}
.bearlymail-landing .cta-final h2 em { font-style: normal; color: var(--sun-light); }
.bearlymail-landing .cta-final p { font-size: 18px; color: var(--ink-2); margin: 0 0 32px; }
.bearlymail-landing .cta-final-actions { display: flex; justify-content: center; }
.bearlymail-landing .cta-final .meta { margin-top: 20px; font-size: 13px; color: var(--ink-3); }
.bearlymail-landing .cta-final .meta b { color: var(--sun-light); font-weight: 600; }

.bearlymail-landing .who-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 1000px) { .bearlymail-landing .who-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .bearlymail-landing .who-grid { grid-template-columns: minmax(0, 1fr); } }
.bearlymail-landing .who-card {
  display: flex; flex-direction: column;
  padding: 24px; background: #fff;
  border: 1px solid var(--line); border-radius: 16px;
}
.bearlymail-landing .who-card h3 { margin: 0 0 8px; font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
.bearlymail-landing .who-card p { margin: 0; font-size: 15px; line-height: 1.6; color: var(--ink-3); }
.bearlymail-landing .who-link { margin-top: auto; padding-top: 16px; font-size: 14.5px; font-weight: 700; color: var(--sun-dark); }
.bearlymail-landing .who-link:hover { text-decoration: underline; }

.bearlymail-landing .security {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 56px; align-items: start;
}
@media (max-width: 980px) { .bearlymail-landing .security { grid-template-columns: minmax(0, 1fr); gap: 32px; } }
.bearlymail-landing .security-intro .kicker {
  display: inline-block; font-size: 12px; font-weight: 700;
  color: var(--sun-dark); letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 16px;
}
.bearlymail-landing .security-audit {
  margin-top: 28px; padding: 20px 22px;
  background: #fff; border: 2px solid var(--sun); border-radius: 16px;
}
.bearlymail-landing .security-audit b { font-family: var(--font-display); font-size: 18px; }
.bearlymail-landing .security-audit p { margin: 8px 0 0; font-size: 15px; line-height: 1.6; color: var(--ink-2); }
.bearlymail-landing .security-points {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px;
}
@media (max-width: 560px) { .bearlymail-landing .security-points { grid-template-columns: minmax(0, 1fr); } }
.bearlymail-landing .security-points li { padding: 20px; background: #fff; border: 1px solid var(--line); border-radius: 14px; }
.bearlymail-landing .security-points li:last-child:nth-child(odd) { grid-column: 1 / -1; }
.bearlymail-landing .security-points h3 { margin: 0 0 6px; font-size: 16.5px; font-weight: 700; }
.bearlymail-landing .security-points p { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--ink-3); }

.bearlymail-landing .connect-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.bearlymail-landing .connect-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream-2);
  font-size: 14px; color: var(--ink);
}
.bearlymail-landing .connect-name { font-weight: 600; }
.bearlymail-landing .connect-status { padding: 2px 8px; border-radius: 999px; background: #DCEFE5; color: #17603F; font-size: 12px; font-weight: 700; }
.bearlymail-landing .connect-result {
  padding: 14px 16px; border-radius: 10px;
  background: linear-gradient(90deg, var(--sun-pale), var(--surface));
  border: 1px solid color-mix(in srgb, var(--sun) 25%, transparent);
  font-size: 14px; line-height: 1.5; color: var(--ink-2);
}
.bearlymail-landing .connect-result b { color: var(--ink); }

.bearlymail-landing .focus-tip {
  display: flex; align-items: flex-start; gap: 14px;
  max-width: 880px; margin: 48px auto 0; padding: 18px 22px;
  background: var(--surface); border: 1px solid var(--line-2); border-radius: 14px;
}
.bearlymail-landing .focus-tip-label {
  flex: none; padding: 3px 10px; border-radius: 999px;
  background: var(--sun); color: var(--on-sun); font-size: 12px; font-weight: 700;
}
.bearlymail-landing .focus-tip p { margin: 0; font-size: 15px; line-height: 1.6; color: var(--ink-2); }

.bearlymail-landing footer.site {
  padding: 40px 0; background: var(--cream);
  border-top: 1px solid var(--line);
}
.bearlymail-landing footer.site .row {
  display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;
  font-size: 13px; color: var(--ink-3);
}
.bearlymail-landing footer.site .links { display: flex; gap: 24px; }
.bearlymail-landing footer.site .links a:hover { color: var(--ink); }


.bearlymail-landing .empty-state {
  padding: 56px 24px; text-align: center; background: #fff;
  animation: blm-fade-in .35s ease both;
}
.bearlymail-landing .empty-state .empty-ic { font-size: 36px; margin-bottom: 8px; }
.bearlymail-landing .empty-state .empty-title { font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.bearlymail-landing .empty-state .empty-sub { font-size: 13px; color: var(--ink-3); }
@keyframes blm-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.bearlymail-landing .routed-toast {
  position: absolute; left: 50%; bottom: 12px;
  transform: translateX(-50%) translateY(8px); opacity: 0;
  pointer-events: none;
  background: var(--dark); color: #fff;
  padding: 10px 18px; border-radius: 999px;
  font-size: 13px; font-weight: 600; letter-spacing: -0.005em;
  display: inline-flex; align-items: center; gap: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,.25);
  transition: opacity .25s ease, transform .3s cubic-bezier(.2,.8,.2,1);
  white-space: nowrap;
  z-index: 5;
}
.bearlymail-landing .routed-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.bearlymail-landing .routed-toast .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sun); }

@media (max-width: 980px) { .bearlymail-landing .demo { transform: none; } }

.bearlymail-landing .github-section { background: var(--cream-2); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.bearlymail-landing .gh-perks {
  list-style: none; padding: 0; margin: 0 auto 40px;
  max-width: 880px;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
}
.bearlymail-landing .gh-perks li {
  display: flex; align-items: center; gap: 8px;
  font-size: 13.5px; color: var(--ink-2); line-height: 1.35;
}
.bearlymail-landing .gh-perk-ic {
  width: 22px; height: 22px; border-radius: 999px;
  background: var(--sun-pale); color: var(--sun-dark);
  display: inline-grid; place-items: center;
  font-size: 11px; font-weight: 700; flex: none;
}
@media (max-width: 880px) {
  .bearlymail-landing .gh-perks { grid-template-columns: 1fr 1fr; }
}

.bearlymail-landing .gh-demo-card { max-width: 880px; margin: 0 auto; }
.bearlymail-landing .gh-email-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-bottom: 4px; flex-wrap: wrap;
}
.bearlymail-landing .gh-email-from { font-size: 13px; color: var(--ink); display: inline-flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.bearlymail-landing .gh-from-name { font-weight: 600; }
.bearlymail-landing .gh-from-handle {
  font-family: inherit;
  font-size: 11.5px; color: var(--ink-4); font-weight: 400;
}
.bearlymail-landing .gh-email-time { font-size: 11.5px; color: var(--ink-4); white-space: nowrap; }
.bearlymail-landing .gh-email-subject {
  font-size: 14px; font-weight: 500; color: var(--ink-2);
  margin-bottom: 12px;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .bearlymail-landing header.site .row { height: 60px; }
  .bearlymail-landing header.site .nav { display: none; }
  .bearlymail-landing .nav-cta { gap: 8px; }
  .bearlymail-landing .nav-cta .btn { height: 44px; padding: 0 12px; font-size: 13px; white-space: nowrap; }
  .bearlymail-landing .brand { font-size: 16px; }

  .bearlymail-landing .hero { padding: 36px 0 8px; }
  .bearlymail-landing h1.display { font-size: clamp(32px, 9vw, 42px); }
  .bearlymail-landing h1.display em { font-size: 1em; }
  .bearlymail-landing .lead { font-size: 16.5px; margin: 18px 0 24px; }
  .bearlymail-landing .hero-cta .btn { width: 100%; height: 56px; font-size: 16px; }
  .bearlymail-landing .hero-benefits { flex-direction: column; gap: 10px; font-size: 14.5px; }
  .bearlymail-landing .hero-built-for { font-size: 14px; }
  .bearlymail-landing .cta-final-actions .btn { width: 100%; }
  .bearlymail-landing .focus-tip { flex-direction: column; gap: 10px; margin-top: 32px; padding: 16px 18px; }
  .bearlymail-landing .compare-note { padding: 18px; }

  .bearlymail-landing .demo-bar { padding: 8px 12px; }
  .bearlymail-landing .demo-title { font-size: 11px; }
  .bearlymail-landing .demo-tabs { padding: 8px 10px 0; overflow-x: auto; }
  .bearlymail-landing .demo-tab { font-size: 11.5px; padding: 6px 10px; white-space: nowrap; }
  .bearlymail-landing .demo-batch-banner { padding: 10px 12px; font-size: 12px; gap: 8px; }
  .bearlymail-landing .demo-batch-banner .timer { font-size: 10.5px; padding: 3px 6px; }
  .bearlymail-landing .demo-foot { padding: 10px 12px; font-size: 11px; flex-direction: column; align-items: flex-start; gap: 4px; }

  .bearlymail-landing section { padding: 56px 0; }
  .bearlymail-landing .section-head { margin-bottom: 36px; }
  .bearlymail-landing h2.section-title { font-size: clamp(28px, 8vw, 36px); }
  .bearlymail-landing .section-sub { font-size: 15px; margin-top: 14px; }

  .bearlymail-landing .problem-card { padding: 22px; }
  .bearlymail-landing .problem-card h3 { font-size: 18px; }
  .bearlymail-landing .problem-card p { font-size: 14px; }

  .bearlymail-landing .step-visual { position: static; padding: 20px; min-height: 0; }
  .bearlymail-landing .step { padding: 18px 18px 18px 20px; gap: 14px; }
  .bearlymail-landing .step h3 { font-size: 16px; }
  .bearlymail-landing .step p { font-size: 14px; }
  .bearlymail-landing .urgent-row { font-size: 12.5px; padding: 8px 10px; gap: 8px; }
  .bearlymail-landing .schedule-grid { grid-template-columns: 50px 1fr; gap: 10px; }
  .bearlymail-landing .schedule-grid .lane { font-size: 11.5px; padding: 0 8px; height: 36px; }
  .bearlymail-landing .score-row { grid-template-columns: 1fr 50px 60px; gap: 8px; }
  .bearlymail-landing .score-row .label { font-size: 12.5px; }
  .bearlymail-landing .score-row .score { font-size: 11px; }

  .bearlymail-landing .compare-card { padding: 24px 22px; }
  .bearlymail-landing .compare-card .name { font-size: 15px; padding-bottom: 14px; margin-bottom: 14px; }
  .bearlymail-landing .compare-card .ask { font-size: 14px; margin-bottom: 18px; }
  .bearlymail-landing .compare-row { grid-template-columns: 90px 1fr; padding: 10px 0; font-size: 13px; }
  .bearlymail-landing .compare-card .price b { font-size: 15px; }

  .bearlymail-landing .founder-band { padding: 64px 0; }
  .bearlymail-landing .founder { gap: 20px; text-align: left; }
  .bearlymail-landing .founder .portrait { width: 120px; height: 120px; border-radius: 18px; }
  .bearlymail-landing .founder blockquote { font-size: clamp(24px, 7vw, 30px); }
  /* Name over role: when the row wrapped, the separator dot hung alone after the name. */
  .bearlymail-landing .founder .who { flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 20px; font-size: 13px; }
  .bearlymail-landing .founder .who .sep { display: none; }
  .bearlymail-landing .founder details { margin-top: 24px; padding-top: 18px; }
  .bearlymail-landing .founder details p { font-size: 14px; }

  .bearlymail-landing .faq-item { padding: 18px 20px; }
  .bearlymail-landing .faq-item summary { font-size: 14.5px; }
  .bearlymail-landing .faq-item p { font-size: 13.5px; }

  .bearlymail-landing .cta-final { padding: 64px 0; }
  .bearlymail-landing .cta-final h2 { font-size: clamp(32px, 9vw, 44px); }
  .bearlymail-landing .cta-final p { font-size: 15px; margin-bottom: 24px; }
  .bearlymail-landing .cta-final .meta { font-size: 12px; }

  .bearlymail-landing footer.site .row { gap: 16px; }
  .bearlymail-landing footer.site .links { gap: 16px; }

  .bearlymail-landing .gh-perks { grid-template-columns: 1fr; gap: 10px; margin-bottom: 28px; }
}

@media (max-width: 380px) {
  /* Logo + "Sign in" + "Get started" ran 14px off a 320px screen. */
  .bearlymail-landing .wrap { padding: 0 16px; }
  .bearlymail-landing header.site .row { gap: 8px; }
  .bearlymail-landing header.site .brand { font-size: 14px; gap: 6px; }
  .bearlymail-landing header.site .brand-mark img { width: 28px; height: 28px; }
  .bearlymail-landing .nav-cta { gap: 2px; }
  .bearlymail-landing .nav-cta .btn { padding: 0 8px; }
  /* The decorative filter icon got clipped at the demo's right edge. */
  .bearlymail-landing .demo-tab-filter { display: none; }
  .bearlymail-landing h1.display { font-size: 30px; }
  .bearlymail-landing .compare-row { grid-template-columns: 1fr; gap: 4px; }
  .bearlymail-landing .compare-row .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
}
`;
