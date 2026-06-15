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
  --sun-dark: #C57316;
  --green: #1F8A5B;
  --red: #D84A2A;
  --warning: #F59E0B;
  --warning-light: #FEF3C7;
  --ribbon-text: #7A3E00;
  --cust: #4A2EAA;
  --prio-red: #B42318;
  --shadow-card: 0 1px 0 rgba(11,11,11,.04), 0 24px 48px -28px rgba(11,11,11,.18);
  --shadow-soft: 0 1px 0 rgba(11,11,11,.04), 0 8px 24px -12px rgba(11,11,11,.10);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--cream);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: "ss01", "cv11";
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
.bearlymail-landing .serif { font-family: "Instrument Serif", "Georgia", serif; font-weight: 400; }
.bearlymail-landing .mono { font-family: "JetBrains Mono", ui-monospace, "SF Mono", monospace; }
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
.bearlymail-landing .btn-sun { color: var(--cream); background: var(--sun); border-color: var(--sun); box-shadow: inset 0 -1px 0 rgba(0,0,0,.12); }
.bearlymail-landing .btn-sun:hover { background: var(--sun-dark); border-color: var(--sun-dark); }
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
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 12px 6px 8px; border-radius: 999px;
  background: var(--sun-pale); color: var(--sun-dark);
  font-size: 12px; font-weight: 600; letter-spacing: 0.02em;
  border: 1px solid color-mix(in srgb, var(--sun) 20%, transparent);
}
.bearlymail-landing .eyebrow .dot { width: 6px; height: 6px; border-radius: 999px; background: var(--sun); box-shadow: 0 0 0 4px color-mix(in srgb, var(--sun) 22%, transparent); }
.bearlymail-landing h1.display {
  font-size: clamp(44px, 6vw, 80px);
  line-height: 0.98; letter-spacing: -0.035em;
  font-weight: 700; margin: 24px 0 0;
  text-wrap: balance;
}
.bearlymail-landing h1.display em { font-style: normal; font-family: "Instrument Serif", serif; font-weight: 400; letter-spacing: -0.01em; color: var(--sun-dark); font-size: 1.05em; line-height: 0.9; }
.bearlymail-landing .lead {
  font-size: 19px; line-height: 1.55; color: var(--ink-2);
  margin: 22px 0 32px; max-width: 540px; text-wrap: pretty;
}
.bearlymail-landing .form-label {
  display: block; font-size: 12px; font-weight: 600;
  color: var(--ink-2); letter-spacing: 0.04em; text-transform: uppercase;
  margin-bottom: 8px;
}
.bearlymail-landing .form-label-dark { color: rgba(255,255,255,.7); }
.bearlymail-landing .hero-form {
  display: flex; gap: 8px; padding: 6px;
  background: #fff; border: 1px solid var(--line-2);
  border-radius: 14px; max-width: 480px;
  box-shadow: var(--shadow-soft);
}
.bearlymail-landing .float-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}
.bearlymail-landing .float-field .float-label {
  position: absolute;
  left: 14px; top: 50%;
  transform: translateY(-50%);
  color: var(--ink-3);
  font-size: 15px; font-weight: 400;
  letter-spacing: 0; text-transform: none;
  pointer-events: none;
  background: transparent; padding: 0; margin: 0;
  transition: top .15s ease, font-size .15s ease, font-weight .15s ease, color .15s ease, letter-spacing .15s ease, padding .15s ease, background .15s ease;
}
.bearlymail-landing .float-field input:focus ~ .float-label,
.bearlymail-landing .float-field input:not(:placeholder-shown) ~ .float-label {
  top: -1px;
  transform: translateY(-50%);
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--ink-2);
  background: #fff; padding: 0 6px;
}
.bearlymail-landing .hero-form input {
  width: 100%; min-width: 0; height: 44px; padding: 0 14px;
  font: inherit; font-size: 15px; color: var(--ink);
  border: none; outline: none; background: transparent;
  display: block;
}
.bearlymail-landing .hero-form input::placeholder { color: var(--ink-4); }
.bearlymail-landing .hero-form .btn { height: 44px; }
.bearlymail-landing .hero-meta {
  display: flex; align-items: center; gap: 18px;
  margin-top: 18px; font-size: 13px; color: var(--ink-3);
}
.bearlymail-landing .hero-meta .pill { display: inline-flex; align-items: center; gap: 6px; }
.bearlymail-landing .hero-meta .check { color: var(--sun-dark); }
.bearlymail-landing .avatars { display: flex; }
.bearlymail-landing .avatars span {
  width: 24px; height: 24px; border-radius: 999px;
  border: 2px solid var(--cream);
  background: var(--cream-3);
  margin-left: -8px;
  display: grid; place-items: center;
  font-size: 10px; font-weight: 600; color: var(--ink-2);
}
.bearlymail-landing .avatars span:first-child { margin-left: 0; }
.bearlymail-landing .avatars span:nth-child(1) { background: #F5C086; color: #5C3010; }
.bearlymail-landing .avatars span:nth-child(2) { background: #C7E5D4; color: #18432D; }
.bearlymail-landing .avatars span:nth-child(3) { background: #D9D5F0; color: #2A2360; }
.bearlymail-landing .avatars span:nth-child(4) { background: #F4D7CE; color: #5A2410; }

.bearlymail-landing .hero-built-for { margin-top: 28px; }
.bearlymail-landing .built-for-text { color: var(--ink-2); }
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
.bearlymail-landing .snooze-try { font-size: 12px; color: var(--ink-3); }
.bearlymail-landing .snooze-footer { margin-top: auto; padding-top: 12px; border-top: 1px dashed var(--line); display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--ink-3); }
.bearlymail-landing .snooze-footer-key { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--sun-pale); color: var(--sun-dark); font-weight: 600; font-family: "JetBrains Mono", monospace; font-size: 11px; }
.bearlymail-landing .compare-recommended { margin-left: auto; padding: 3px 8px; font-size: 10.5px; font-weight: 600; background: var(--sun); color: var(--ink); border-radius: 999px; }
.bearlymail-landing .founder-kicker { display: inline-block; font-size: 12px; font-weight: 600; color: var(--sun-dark); letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 16px; }
.bearlymail-landing .focus-bear-link { color: var(--sun-dark); font-weight: 600; }
.bearlymail-landing .footer-brand { font-size: 14px; }
.bearlymail-landing .footer-brand-mark { width: 24px; height: 24px; }
.bearlymail-landing .footer-brand-mark img { width: 24px; height: 24px; }
.bearlymail-landing .modal-error { background: rgba(216,74,42,0.10); color: var(--red); padding: 10px 12px; border-radius: 10px; margin-bottom: 16px; font-size: 13px; }
.bearlymail-landing .modal-notice { background: var(--sun-pale); color: var(--sun-dark); padding: 10px 12px; border-radius: 10px; margin-bottom: 16px; font-size: 13px; }
.bearlymail-landing .modal-success-title { margin-bottom: 10px; }
.bearlymail-landing .modal-success-sub { margin-bottom: 20px; }

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
  border-bottom: 2px solid transparent; font-weight: 500;
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
  margin-left: auto; font-family: "JetBrains Mono", monospace;
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
.bearlymail-landing .section-dark { background: var(--ink); color: var(--cream); }

.bearlymail-landing .section-head { max-width: 740px; margin: 0 auto 56px; text-align: center; }
.bearlymail-landing .section-head .kicker {
  display: inline-block; font-size: 12px; font-weight: 600;
  color: var(--sun-dark); letter-spacing: 0.14em; text-transform: uppercase;
  margin-bottom: 16px;
}
.bearlymail-landing h2.section-title {
  font-size: clamp(32px, 4vw, 48px);
  line-height: 1.05; letter-spacing: -0.025em;
  font-weight: 700; margin: 0;
  text-wrap: balance;
}
.bearlymail-landing h2.section-title em { font-style: normal; font-family: "Instrument Serif", serif; font-weight: 400; color: var(--sun-dark); font-size: 1.08em; line-height: 0.9; }
.bearlymail-landing .section-sub {
  font-size: 17px; line-height: 1.55; color: var(--ink-2);
  margin-top: 18px; text-wrap: pretty;
}

.bearlymail-landing .problems {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
}
@media (max-width: 880px) { .bearlymail-landing .problems { grid-template-columns: 1fr; } }
.bearlymail-landing .problem-card {
  padding: 32px 28px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  position: relative;
}
.bearlymail-landing .problem-card .num {
  font-family: "Instrument Serif", serif;
  font-size: 56px; line-height: 1; color: var(--sun);
  margin-bottom: 16px;
}
.bearlymail-landing .problem-card h3 {
  font-size: 19px; font-weight: 600; letter-spacing: -0.01em;
  margin: 0 0 10px;
}
.bearlymail-landing .problem-card p {
  font-size: 14.5px; line-height: 1.6; color: var(--ink-3); margin: 0;
}
.bearlymail-landing .problem-card .demo-mini {
  margin-top: 20px; padding: 12px; border-radius: 10px;
  background: var(--cream-2); border: 1px solid var(--line);
  font-size: 12px; color: var(--ink-2);
  font-family: "JetBrains Mono", monospace;
}
.bearlymail-landing .problem-card .demo-mini .row { display: flex; justify-content: space-between; padding: 4px 0; }
.bearlymail-landing .problem-card .demo-mini .strike { text-decoration: line-through; color: var(--ink-4); }
.bearlymail-landing .problem-card .demo-mini b { color: var(--ink); font-weight: 600; font-family: inherit; }

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
  border: 1px solid transparent;
  display: grid; grid-template-columns: 28px 1fr; gap: 18px; align-items: start;
}
.bearlymail-landing .step:hover { background: var(--cream-2); }
.bearlymail-landing .step.active { background: #fff; border-color: var(--line-2); box-shadow: var(--shadow-soft); }
.bearlymail-landing .step .n {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px; font-weight: 500; color: var(--ink-4);
  padding-top: 4px;
}
.bearlymail-landing .step.active .n { color: var(--sun-dark); }
.bearlymail-landing .step h3 { margin: 0 0 6px; font-size: 18px; font-weight: 600; letter-spacing: -0.005em; }
.bearlymail-landing .step p { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--ink-3); }

.bearlymail-landing .step-visual {
  position: sticky; top: 96px;
  background: #fff;
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
.bearlymail-landing .schedule-grid .time { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--ink-3); text-align: right; }
.bearlymail-landing .schedule-grid .now { color: var(--sun-dark); font-weight: 600; }
.bearlymail-landing .schedule-grid .lane {
  height: 40px; border-radius: 8px;
  background: var(--cream-2); position: relative;
  border: 1px dashed var(--line-2);
  display: flex; align-items: center; padding: 0 10px;
  font-size: 12px; color: var(--ink-3);
}
.bearlymail-landing .schedule-grid .lane.delivered {
  background: linear-gradient(90deg, var(--sun-pale), color-mix(in srgb, var(--sun-pale) 50%, #fff));
  border: 1px solid color-mix(in srgb, var(--sun) 25%, transparent);
  color: var(--sun-dark); font-weight: 500;
}
.bearlymail-landing .schedule-grid .lane.delivered b { color: var(--sun-dark); }
.bearlymail-landing .schedule-grid .lane .pill { margin-left: auto; font-size: 10.5px; font-family: "JetBrains Mono", monospace; }
.bearlymail-landing .schedule-grid .lane.quiet { background: repeating-linear-gradient(135deg, var(--cream-2), var(--cream-2) 6px, var(--cream-3) 6px, var(--cream-3) 7px); color: var(--ink-4); }

.bearlymail-landing .score-list { display: flex; flex-direction: column; gap: 10px; }
.bearlymail-landing .score-row {
  display: grid; grid-template-columns: 1fr 60px 80px; gap: 12px; align-items: center;
  padding: 8px 4px; border-bottom: 1px dashed var(--line);
}
.bearlymail-landing .score-row:last-child { border-bottom: none; }
.bearlymail-landing .score-row .label { font-size: 13px; }
.bearlymail-landing .score-row .label small { display: block; color: var(--ink-4); font-size: 11px; margin-top: 2px; }
.bearlymail-landing .score-row .score { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--ink-2); text-align: right; }
.bearlymail-landing .score-row .meter { height: 6px; border-radius: 999px; background: var(--cream-3); overflow: hidden; }
.bearlymail-landing .score-row .meter i { display: block; height: 100%; background: linear-gradient(90deg, var(--sun-light), var(--sun)); }
.bearlymail-landing .score-row.high .score { color: var(--sun-dark); font-weight: 600; }

.bearlymail-landing .urgent-flow { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }
.bearlymail-landing .urgent-row {
  display: grid; grid-template-columns: 24px 1fr auto; gap: 10px; align-items: center;
  padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream-2);
  font-size: 13px; color: var(--ink-2);
}
.bearlymail-landing .urgent-row.match { background: linear-gradient(90deg, var(--sun-pale), #fff); border-color: color-mix(in srgb, var(--sun) 25%, transparent); }
.bearlymail-landing .urgent-row .ic { width: 20px; height: 20px; border-radius: 6px; background: var(--cream-3); display: grid; place-items: center; font-size: 11px; font-weight: 600; color: var(--ink-3); }
.bearlymail-landing .urgent-row.match .ic { background: var(--sun); color: #fff; }
.bearlymail-landing .urgent-row .out { font-family: "JetBrains Mono", monospace; font-size: 11px; color: var(--ink-3); }
.bearlymail-landing .urgent-row.match .out { color: var(--sun-dark); font-weight: 600; }

.bearlymail-landing .snooze-input {
  display: flex; align-items: center; gap: 0;
  background: var(--cream-2); border: 1px solid var(--line-2); border-radius: 10px;
  padding: 4px;
}
.bearlymail-landing .snooze-input .label { font-size: 12px; color: var(--ink-3); padding: 0 10px; font-family: "JetBrains Mono", monospace; }
.bearlymail-landing .snooze-input input {
  flex: 1; height: 36px; border: 0; background: #fff; border-radius: 6px;
  padding: 0 12px; font: inherit; font-size: 13px; outline: none;
}
.bearlymail-landing .snooze-input .key {
  font-family: "JetBrains Mono", monospace; font-size: 11px;
  background: #fff; border: 1px solid var(--line); padding: 4px 8px; border-radius: 6px; color: var(--ink-3);
}
.bearlymail-landing .snooze-suggest { display: flex; gap: 6px; flex-wrap: wrap; }
.bearlymail-landing .snooze-suggest span {
  padding: 5px 10px; border-radius: 999px; background: var(--cream-2);
  border: 1px solid var(--line); font-size: 12px; color: var(--ink-2);
  font-family: "JetBrains Mono", monospace;
}
.bearlymail-landing .snooze-suggest span.hi { background: var(--sun-pale); color: var(--sun-dark); border-color: color-mix(in srgb, var(--sun) 25%, transparent); }

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
  background: var(--dark); color: var(--cream);
  border-color: var(--dark);
  transform: translateY(-12px);
  box-shadow: var(--shadow-card);
}
@media (max-width: 880px) { .bearlymail-landing .compare-card.us { transform: none; } }
.bearlymail-landing .compare-card .name {
  display: flex; align-items: center; gap: 10px;
  font-size: 16px; font-weight: 600; letter-spacing: -0.01em;
  padding-bottom: 16px; margin-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.bearlymail-landing .compare-card.us .name { border-bottom-color: rgba(255,255,255,.12); }
.bearlymail-landing .compare-card .logo {
  width: 28px; height: 28px; border-radius: 8px;
  display: grid; place-items: center; font-size: 13px; font-weight: 700;
}
.bearlymail-landing .logo-bm { background: var(--sun); color: var(--ink); }
.bearlymail-landing .logo-sh { background: var(--cream-2); color: var(--ink); border: 1px solid var(--line-2); }
.bearlymail-landing .logo-gm { background: var(--cream-2); color: var(--ink); border: 1px solid var(--line-2); }
.bearlymail-landing .compare-card .ask {
  font-family: "Inter", sans-serif; font-style: normal;
  font-size: 15px; line-height: 1.45;
  font-weight: 500; letter-spacing: -0.005em;
  margin-bottom: 24px;
  color: var(--ink);
}
.bearlymail-landing .compare-card.us .ask { color: #FFFFFF; font-weight: 600; }
.bearlymail-landing .compare-row {
  display: grid; grid-template-columns: 100px 1fr; gap: 12px;
  padding: 12px 0; border-top: 1px dashed var(--line);
  font-size: 13.5px;
}
.bearlymail-landing .compare-card.us .compare-row { border-top-color: rgba(255,255,255,.18); }
.bearlymail-landing .compare-row .k { color: var(--ink-2); font-weight: 500; }
.bearlymail-landing .compare-card.us .compare-row .k { color: #C8C2B4; }
.bearlymail-landing .compare-row .v { color: var(--ink); }
.bearlymail-landing .compare-card.us .compare-row .v { color: #FFFFFF; font-weight: 500; }
.bearlymail-landing .compare-row .v .ck { color: var(--green); font-weight: 700; }
.bearlymail-landing .compare-card.us .compare-row .v .ck { color: #79E1A8; }
.bearlymail-landing .compare-row .v .x { color: #B89B7A; font-weight: 700; }
.bearlymail-landing .compare-card.us .compare-row .v .x { color: #C8C2B4; }
.bearlymail-landing .compare-card .price {
  margin-top: auto; padding-top: 24px;
  font-size: 13px; color: var(--ink-2);
}
.bearlymail-landing .compare-card.us .price { color: #FFD9A8; }
.bearlymail-landing .compare-card .price b { color: var(--ink); font-size: 16px; }
.bearlymail-landing .compare-card.us .price b { color: #FFFFFF; }

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
  font-family: "Instrument Serif", serif;
  font-size: clamp(28px, 3.4vw, 44px);
  line-height: 1.15; letter-spacing: -0.01em;
  color: var(--ink); text-wrap: balance;
}
.bearlymail-landing .founder blockquote .accent { color: var(--sun-dark); }
.bearlymail-landing .founder .who {
  margin-top: 28px; font-size: 14px; color: var(--ink-3);
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}
.bearlymail-landing .founder .who b { color: var(--ink); font-weight: 600; font-family: "Inter", sans-serif; }
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
  background: var(--dark); color: var(--cream);
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
.bearlymail-landing .cta-final h2 em { font-style: normal; font-family: "Instrument Serif", serif; font-weight: 400; color: var(--sun-light); font-size: 1.06em; }
.bearlymail-landing .cta-final p { font-size: 18px; color: #E8E0CE; margin: 0 0 32px; }
.bearlymail-landing .cta-final .form {
  display: flex; gap: 8px; padding: 6px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,.20);
  border-radius: 14px; max-width: 480px; margin: 0 auto;
}
.bearlymail-landing .float-field-dark .float-label {
  color: rgba(255,255,255,.55);
}
.bearlymail-landing .float-field-dark input:focus ~ .float-label,
.bearlymail-landing .float-field-dark input:not(:placeholder-shown) ~ .float-label {
  color: rgba(255,255,255,.85);
  background: var(--dark);
}
.bearlymail-landing .cta-final .form input {
  width: 100%; min-width: 0; height: 48px; padding: 0 16px;
  font: inherit; font-size: 15px; color: #FFFFFF;
  border: none; outline: none; background: transparent;
  display: block;
}
.bearlymail-landing .cta-final .form input::placeholder { color: rgba(255,255,255,.55); }
.bearlymail-landing .cta-final .form .btn { height: 48px; }
.bearlymail-landing .cta-final .meta { margin-top: 20px; font-size: 13px; color: #C8C2B4; }
.bearlymail-landing .cta-final .meta b { color: var(--sun-light); font-weight: 600; }

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

.bearlymail-landing .modal-bg {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(11,11,11,0.5);
  backdrop-filter: blur(6px);
  display: none; align-items: center; justify-content: center;
  padding: 24px;
}
.bearlymail-landing .modal-bg.open { display: flex; }
.bearlymail-landing .modal {
  width: 100%; max-width: 520px;
  background: #fff; border-radius: 18px;
  border: 1px solid var(--line-2);
  box-shadow: 0 30px 80px -20px rgba(0,0,0,.45);
  padding: 32px;
  position: relative;
  max-height: calc(100vh - 48px); overflow-y: auto;
}
.bearlymail-landing .modal h3 {
  margin: 0 0 8px; font-size: 24px; letter-spacing: -0.02em; font-weight: 700;
}
.bearlymail-landing .modal h3 em { font-style: normal; font-family: "Instrument Serif", serif; font-weight: 400; color: var(--sun-dark); font-size: 1.1em; }
.bearlymail-landing .modal .modal-sub { font-size: 14.5px; color: var(--ink-3); margin: 0 0 24px; line-height: 1.5; }
.bearlymail-landing .modal-close {
  position: absolute; top: 16px; right: 16px;
  width: 32px; height: 32px; border-radius: 8px;
  background: transparent; border: 0; cursor: pointer;
  color: var(--ink-3); font-size: 20px;
}
.bearlymail-landing .modal-close:hover { background: var(--cream-2); color: var(--ink); }
.bearlymail-landing .field { display: block; margin-bottom: 16px; }
.bearlymail-landing .field label { display: block; font-size: 12.5px; font-weight: 600; color: var(--ink-2); margin-bottom: 6px; }
.bearlymail-landing .field input, .bearlymail-landing .field select, .bearlymail-landing .field textarea {
  width: 100%; padding: 12px 14px;
  border: 1px solid var(--line-2); border-radius: 10px;
  background: #fff; color: var(--ink);
  font: inherit; font-size: 14px;
  outline: none; transition: border-color .12s, box-shadow .12s;
}
.bearlymail-landing .field input:focus, .bearlymail-landing .field select:focus, .bearlymail-landing .field textarea:focus {
  border-color: var(--sun);
  box-shadow: 0 0 0 3px var(--sun-pale);
}
.bearlymail-landing .field textarea { resize: vertical; min-height: 80px; }
.bearlymail-landing .field .hint { font-size: 11.5px; color: var(--ink-4); margin-top: 4px; }
.bearlymail-landing .modal .actions { display: flex; gap: 10px; margin-top: 8px; }
.bearlymail-landing .modal .actions .btn { flex: 1; }
.bearlymail-landing .modal-success { text-align: center; padding: 12px 0; }
.bearlymail-landing .modal-success .check {
  width: 64px; height: 64px; border-radius: 999px;
  background: var(--sun-pale); color: var(--sun-dark);
  display: grid; place-items: center;
  margin: 0 auto 18px; font-size: 32px; font-weight: 700;
}

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
  font-family: "JetBrains Mono", monospace;
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
  .bearlymail-landing h1.display { font-size: clamp(40px, 11vw, 52px); }
  .bearlymail-landing h1.display em { font-size: 1em; }
  .bearlymail-landing .lead { font-size: 16px; margin: 18px 0 24px; }
  .bearlymail-landing .form-label { font-size: 13px; margin-bottom: 10px; }
  .bearlymail-landing .hero-form { flex-direction: column; padding: 0; gap: 12px; width: 100%; max-width: 100%; background: transparent; border: none; box-shadow: none; }
  .bearlymail-landing .hero-form .float-field { width: 100%; flex: none; }
  .bearlymail-landing .hero-form input { display: block; width: 100%; min-width: 0; height: 64px; padding: 0 18px; font-size: 17px; background: #fff; border: 2px solid var(--ink); border-radius: 12px; color: var(--ink); }
  .bearlymail-landing .hero-form input:focus { border-color: var(--sun); box-shadow: 0 0 0 4px var(--sun-pale); }
  .bearlymail-landing .hero-form .btn { width: 100%; height: 56px; font-size: 16px; }
  .bearlymail-landing .hero-form .float-field .float-label { left: 18px; font-size: 16px; }
  .bearlymail-landing .hero-form .float-field input:focus ~ .float-label,
  .bearlymail-landing .hero-form .float-field input:not(:placeholder-shown) ~ .float-label { top: 0; font-size: 11px; padding: 0 6px; }
  .bearlymail-landing .hero-meta { flex-wrap: wrap; gap: 10px 14px; font-size: 12.5px; }

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

  .bearlymail-landing .problem-card { padding: 24px 22px; }
  .bearlymail-landing .problem-card .num { font-size: 44px; margin-bottom: 12px; }
  .bearlymail-landing .problem-card h3 { font-size: 17px; }
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
  .bearlymail-landing .snooze-suggest span { font-size: 11px; padding: 4px 8px; }

  .bearlymail-landing .compare-card { padding: 24px 22px; }
  .bearlymail-landing .compare-card .name { font-size: 15px; padding-bottom: 14px; margin-bottom: 14px; }
  .bearlymail-landing .compare-card .ask { font-size: 14px; margin-bottom: 18px; }
  .bearlymail-landing .compare-row { grid-template-columns: 90px 1fr; padding: 10px 0; font-size: 13px; }
  .bearlymail-landing .compare-card .price b { font-size: 15px; }

  .bearlymail-landing .founder-band { padding: 64px 0; }
  .bearlymail-landing .founder { gap: 20px; text-align: left; }
  .bearlymail-landing .founder .portrait { width: 120px; height: 120px; border-radius: 18px; }
  .bearlymail-landing .founder blockquote { font-size: clamp(24px, 7vw, 30px); }
  .bearlymail-landing .founder .who { gap: 8px 12px; margin-top: 20px; font-size: 13px; }
  .bearlymail-landing .founder details { margin-top: 24px; padding-top: 18px; }
  .bearlymail-landing .founder details p { font-size: 14px; }

  .bearlymail-landing .faq-item { padding: 18px 20px; }
  .bearlymail-landing .faq-item summary { font-size: 14.5px; }
  .bearlymail-landing .faq-item p { font-size: 13.5px; }

  .bearlymail-landing .cta-final { padding: 64px 0; }
  .bearlymail-landing .cta-final h2 { font-size: clamp(32px, 9vw, 44px); }
  .bearlymail-landing .cta-final p { font-size: 15px; margin-bottom: 24px; }
  .bearlymail-landing .cta-final .form { flex-direction: column; padding: 8px; gap: 10px; max-width: 100%; background: rgba(255,255,255,.10); border: 2px solid rgba(255,255,255,.35); }
  .bearlymail-landing .cta-final .form .float-field { width: 100%; flex: none; }
  .bearlymail-landing .cta-final .form input { display: block; width: 100%; height: 56px; font-size: 16px; background: rgba(0,0,0,.18); border-radius: 8px; padding: 0 14px; }
  .bearlymail-landing .cta-final .form .btn { height: 52px; width: 100%; font-size: 15px; }
  .bearlymail-landing .cta-final .form .float-field .float-label { left: 16px; font-size: 16px; }
  .bearlymail-landing .cta-final .form .float-field input:focus ~ .float-label,
  .bearlymail-landing .cta-final .form .float-field input:not(:placeholder-shown) ~ .float-label { top: 0; font-size: 11px; padding: 0 6px; }
  .bearlymail-landing .cta-final .meta { font-size: 12px; }

  .bearlymail-landing footer.site .row { gap: 16px; }
  .bearlymail-landing footer.site .links { gap: 16px; }

  .bearlymail-landing .gh-perks { grid-template-columns: 1fr; gap: 10px; margin-bottom: 28px; }

  .bearlymail-landing .modal { padding: 24px 20px; }
  .bearlymail-landing .modal h3 { font-size: 22px; }
  .bearlymail-landing .modal .actions { flex-direction: column-reverse; gap: 10px; }
  .bearlymail-landing .modal .actions .btn { width: 100%; flex: none; }
  .bearlymail-landing .modal .actions .btn-lg { height: 56px; font-size: 16px; }
}

@media (max-width: 380px) {
  .bearlymail-landing h1.display { font-size: 36px; }
  .bearlymail-landing .compare-row { grid-template-columns: 1fr; gap: 4px; }
  .bearlymail-landing .compare-row .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
}

/* =======================================================================
 * Rich interactive demo (default landing hero) — ports Landing.html.
 * All rules are scoped under .demo-rich so the persona landing demos
 * (which still use the simpler LiveDemo) are untouched.
 * ======================================================================= */

/* "Try the live demo" callout + hand-drawn arrow */
.bearlymail-landing .demo-rich .demo { transform: none; z-index: 1; }
.bearlymail-landing .demo-callout {
  display: flex; align-items: flex-end; gap: 10px;
  margin: 0 0 8px 6px;
}
.bearlymail-landing .demo-callout .label {
  font-family: "Instrument Serif", "Georgia", serif;
  font-size: 34px; line-height: 1; color: var(--sun-dark);
  transform: rotate(-3deg); white-space: nowrap;
}
.bearlymail-landing .demo-callout .arrow { width: 72px; height: 52px; color: var(--sun-dark); flex-shrink: 0; }
@media (max-width: 980px) { .bearlymail-landing .demo-callout { justify-content: center; margin-left: 0; } }
@media (max-width: 520px) {
  .bearlymail-landing .demo-callout .label { font-size: 28px; }
  .bearlymail-landing .demo-callout .arrow { width: 58px; height: 42px; }
}

.bearlymail-landing .demo-rich .tour-replay {
  font-size: 11px; font-weight: 600; color: var(--ink-3);
  background: transparent; border: 1px solid var(--line);
  border-radius: 999px; padding: 3px 9px; cursor: pointer; margin-right: 4px;
  transition: color .12s, border-color .12s;
}
.bearlymail-landing .demo-rich .tour-replay:hover { color: var(--ink); border-color: var(--line-2); }

/* Scrollable pane stack */
.bearlymail-landing .demo-rich .demo-panes {
  position: relative;
  max-height: 360px; overflow-y: auto; overscroll-behavior: contain;
  scrollbar-width: thin; scrollbar-color: var(--line) transparent;
}
.bearlymail-landing .demo-rich .demo-panes::-webkit-scrollbar { width: 8px; }
.bearlymail-landing .demo-rich .demo-panes::-webkit-scrollbar-track { background: transparent; }
.bearlymail-landing .demo-rich .demo-panes::-webkit-scrollbar-thumb {
  background: var(--line); border-radius: 999px; border: 2px solid #fff; background-clip: padding-box;
}
.bearlymail-landing .demo-rich .demo-panes.flying-active { overflow: visible; }
.bearlymail-landing .demo-rich .demo-pane[hidden] { display: none; }
.bearlymail-landing .demo-rich .demo-pane { padding: 14px 14px 18px; }
.bearlymail-landing .demo-rich .topic-group,
.bearlymail-landing .demo-rich .topic-head { position: relative; }
.bearlymail-landing .demo-rich .card-stack { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }

/* Email card */
.bearlymail-landing .demo-rich .email-card {
  position: relative; overflow: hidden; margin-top: 0;
  background: #fff; border-radius: 12px;
  border: 1px solid var(--line); border-left: 4px solid var(--sun);
  box-shadow: var(--shadow-soft); padding: 16px 18px; cursor: pointer;
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}
.bearlymail-landing .demo-rich .email-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-card); }
.bearlymail-landing .demo-rich .email-card:focus-visible { outline: 2px solid var(--sun); outline-offset: 2px; }
.bearlymail-landing .demo-rich .email-card.urgent-card {
  border: 2px solid var(--warning); border-left: 4px solid var(--warning); padding-top: 40px;
}
.bearlymail-landing .demo-rich .email-card.just-moved { animation: blm-just-moved 1.8s ease; }
@keyframes blm-just-moved {
  0% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--sun) 60%, transparent); }
  100% { box-shadow: var(--shadow-soft); }
}
.bearlymail-landing .demo-rich .email-card.snoozing { animation: blm-snooze-out .48s ease forwards; pointer-events: none; }
@keyframes blm-snooze-out { to { transform: translateY(26px) scale(.96); opacity: 0; } }

.bearlymail-landing .demo-rich .email-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px;
}
.bearlymail-landing .demo-rich .email-from { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.bearlymail-landing .demo-rich .email-from .sender { font-size: 15px; color: var(--ink); font-weight: 600; letter-spacing: -0.005em; }
.bearlymail-landing .demo-rich .email-time { font-size: 12px; color: var(--ink-4); white-space: nowrap; padding-top: 1px; }

.bearlymail-landing .demo-rich .chip {
  display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 6px;
  font-size: 11px; font-weight: 500; line-height: 1.4; border: 1px solid; white-space: nowrap; flex-shrink: 0;
}
.bearlymail-landing .demo-rich .chip-team {
  background: color-mix(in srgb, var(--cust) 12%, #fff); color: var(--cust);
  border-color: color-mix(in srgb, var(--cust) 28%, transparent);
}
.bearlymail-landing .demo-rich .chip-prio {
  background: var(--sun-pale); color: var(--prio-red); border-color: var(--prio-red);
  border-radius: 999px; padding: 2px 8px;
}
.bearlymail-landing .demo-rich .chip-prio-med {
  background: #F9D8B3; color: #7A4E12; border-color: color-mix(in srgb, var(--sun) 50%, transparent);
}
.bearlymail-landing .demo-rich .chip-prio-low {
  background: var(--sun-pale); color: var(--sun-dark); border-color: color-mix(in srgb, var(--sun) 40%, transparent);
}
.bearlymail-landing .demo-rich .chip-wait {
  background: #FFF6E6; color: #8A5A12; border-color: color-mix(in srgb, var(--sun) 35%, transparent);
  border-radius: 999px; padding: 2px 8px;
}

.bearlymail-landing .demo-rich .email-subj { font-size: 14px; font-weight: 700; color: var(--ink); margin-bottom: 6px; line-height: 1.35; }
.bearlymail-landing .demo-rich .email-preview {
  font-size: 14px; color: var(--ink-2); line-height: 1.55; margin-bottom: 8px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bearlymail-landing .demo-rich .email-card.open .email-preview { display: none; }

/* Read toggle + detail body */
.bearlymail-landing .demo-rich .read-toggle {
  display: inline-flex; align-items: center; gap: 6px; margin-bottom: 10px; white-space: nowrap;
  font-size: 12px; font-weight: 600; color: var(--sun-dark); background: none; border: none; padding: 0; cursor: pointer;
}
.bearlymail-landing .demo-rich .read-toggle .chev { transition: transform .2s ease; font-size: 10px; }
.bearlymail-landing .demo-rich .email-card.open .read-toggle .chev { transform: rotate(180deg); }
.bearlymail-landing .demo-rich .email-detail {
  display: none; margin: 2px 0 12px; padding: 16px; background: var(--cream-2);
  border: 1px solid var(--line); border-radius: 8px; color: var(--ink-2);
  font-size: 13px; line-height: 1.8; white-space: pre-wrap;
}
.bearlymail-landing .demo-rich .email-card.open .email-detail { display: block; }

/* Reply lock CTA */
.bearlymail-landing .demo-rich .reply-lock {
  display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap;
  margin: 0 0 12px; padding: 11px 14px; border: 1px dashed var(--line);
  border-radius: 10px; background: var(--cream-2);
}
.bearlymail-landing .demo-rich .reply-lock-ic { font-size: 14px; line-height: 1; }
.bearlymail-landing .demo-rich .reply-lock-txt { font-size: 12.5px; color: var(--ink-3); }
.bearlymail-landing .demo-rich .reply-lock-cta {
  font-size: 12.5px; font-weight: 600; color: var(--sun-dark); background: none; border: none;
  text-decoration: none; margin-left: auto; white-space: nowrap; cursor: pointer; padding: 0;
}
.bearlymail-landing .demo-rich .reply-lock-cta:hover { text-decoration: underline; }

/* Action row */
.bearlymail-landing .demo-rich .email-foot {
  display: flex; flex-direction: row; gap: 16px; align-items: center; flex-wrap: wrap;
  background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin-top: 4px;
}
.bearlymail-landing .demo-rich .prio-block { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.bearlymail-landing .demo-rich .prio-label { font-size: 12px; color: var(--ink-3); font-weight: 500; white-space: nowrap; }
.bearlymail-landing .demo-rich .prio-row {
  position: relative; display: flex; align-items: center; gap: 4px; padding: 4px 8px;
  background: var(--cream-2); border: 1px solid var(--line); border-radius: 8px; width: max-content;
}
.bearlymail-landing .demo-rich .prio-btn {
  appearance: none; background: transparent; border: none; padding: 2px 6px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0;
  opacity: 0.4; transition: opacity .12s, transform .1s; position: relative;
}
.bearlymail-landing .demo-rich .prio-btn:hover { opacity: 1; transform: scale(1.08); }
.bearlymail-landing .demo-rich .prio-btn.active { opacity: 1; }
.bearlymail-landing .demo-rich .prio-btn .emo { font-size: 22px; line-height: 1; }
.bearlymail-landing .demo-rich .prio-btn .emo-l { font-size: 10px; color: var(--ink-3); white-space: nowrap; }
.bearlymail-landing .demo-rich .prio-btn.active .emo-l { color: var(--sun-dark); font-weight: 600; }
.bearlymail-landing .demo-rich .prio-btn.pulse { animation: blm-prio-pulse 1.9s ease-out infinite; }
.bearlymail-landing .demo-rich .prio-btn.pulse::after {
  content: ""; position: absolute; inset: -3px; border-radius: 12px; border: 2px solid var(--sun);
  pointer-events: none; animation: blm-prio-ring 1.9s ease-out infinite;
}
.bearlymail-landing .demo-rich .prio-btn.pulse:hover { animation-play-state: paused; }
.bearlymail-landing .demo-rich .prio-btn.pulse:hover::after { animation-play-state: paused; opacity: 0.95; }

.bearlymail-landing .demo-rich .row-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-left: auto; }
.bearlymail-landing .demo-rich .row-act {
  display: inline-flex; align-items: center; gap: 4px; background: transparent; border: none;
  cursor: pointer; font-size: 12px; color: var(--ink-3); padding: 0 2px; position: relative;
}
.bearlymail-landing .demo-rich .row-act:hover { color: var(--ink); }
.bearlymail-landing .demo-rich .row-act.pulse { color: var(--sun-dark); border-radius: 8px; animation: blm-prio-pulse 1.9s ease-out infinite; }
.bearlymail-landing .demo-rich .row-act.pulse::after {
  content: ""; position: absolute; inset: -4px -7px; border-radius: 10px; border: 2px solid var(--sun);
  pointer-events: none; animation: blm-prio-ring 1.9s ease-out infinite;
}
.bearlymail-landing .demo-rich .row-act.pulse:hover { animation-play-state: paused; }
.bearlymail-landing .demo-rich .row-act.pulse:hover::after { animation-play-state: paused; opacity: 0.95; }

/* Follow-up send button */
.bearlymail-landing .demo-rich .fu-send {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600;
  color: var(--sun-dark); background: var(--sun-pale);
  border: 1px solid color-mix(in srgb, var(--sun) 32%, transparent); border-radius: 8px;
  padding: 7px 12px; cursor: pointer; transition: background .12s, border-color .12s, color .12s;
}
.bearlymail-landing .demo-rich .fu-send:hover { background: #fff; }
.bearlymail-landing .demo-rich .fu-send.sent {
  color: var(--green); background: #E7F5EE; border-color: color-mix(in srgb, var(--green) 35%, transparent); cursor: default;
}

/* Animated tap cursor on the recommended reaction */
.bearlymail-landing .demo-rich .tap-hint { position: absolute; right: 2px; bottom: -20px; width: 30px; height: 30px; pointer-events: none; z-index: 4; }
.bearlymail-landing .demo-rich .tap-hint .cursor {
  position: absolute; right: 0; bottom: 0; width: 24px; height: 24px;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,.3)); animation: blm-tap-move 2.2s ease-in-out infinite;
}
.bearlymail-landing .demo-rich .tap-hint .ring {
  position: absolute; right: 4px; top: -2px; width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid var(--sun); animation: blm-tap-ring 2.2s ease-out infinite;
}
@keyframes blm-tap-move { 0%, 100% { transform: translate(7px, 7px); } 42%, 58% { transform: translate(0, 0); } }
@keyframes blm-tap-ring {
  0%, 38% { opacity: 0; transform: scale(.35); }
  50% { opacity: .85; transform: scale(.55); }
  78%, 100% { opacity: 0; transform: scale(1.7); }
}
.bearlymail-landing .demo-rich .demo.engaged .tap-hint { display: none; }
@media (prefers-reduced-motion: reduce) {
  .bearlymail-landing .demo-rich .tap-hint .cursor, .bearlymail-landing .demo-rich .tap-hint .ring { animation: none; }
}

/* Mini product tour */
.bearlymail-landing .demo-rich .tour { position: absolute; inset: 0; z-index: 40; display: none; pointer-events: none; }
.bearlymail-landing .demo-rich .tour.on { display: block; pointer-events: auto; }
.bearlymail-landing .demo-rich .tour-dim { position: absolute; background: rgba(20, 20, 20, 0.55); pointer-events: auto; }
.bearlymail-landing .demo-rich .tour-spot {
  position: absolute; left: 0; top: 0; width: 0; height: 0; border-radius: 12px; pointer-events: none;
  transition: left .38s cubic-bezier(.4,0,.2,1), top .38s cubic-bezier(.4,0,.2,1), width .38s cubic-bezier(.4,0,.2,1), height .38s cubic-bezier(.4,0,.2,1);
}
.bearlymail-landing .demo-rich .tour-spot::after {
  content: ""; position: absolute; inset: -3px; border-radius: 14px; border: 2px solid var(--sun);
  pointer-events: none; animation: blm-prio-ring 1.8s ease-out infinite;
}
.bearlymail-landing .demo-rich .tour-pop {
  position: absolute; left: 0; top: 0; width: min(284px, 78%); background: #fff;
  border: 1px solid var(--line-2); border-radius: 14px; box-shadow: 0 18px 44px rgba(20, 20, 20, 0.24);
  padding: 16px 16px 14px; z-index: 2;
  transition: left .38s cubic-bezier(.4,0,.2,1), top .38s cubic-bezier(.4,0,.2,1);
}
.bearlymail-landing .demo-rich .tour-pop .step-dots { display: flex; gap: 5px; margin-bottom: 10px; }
.bearlymail-landing .demo-rich .tour-pop .step-dots i { width: 6px; height: 6px; border-radius: 999px; background: var(--cream-3); transition: background .2s; }
.bearlymail-landing .demo-rich .tour-pop .step-dots i.on { background: var(--sun); }
.bearlymail-landing .demo-rich .tour-txt { font-size: 13.5px; line-height: 1.5; color: var(--ink); margin-bottom: 14px; }
.bearlymail-landing .demo-rich .tour-txt b { color: var(--sun-dark); font-weight: 700; }
.bearlymail-landing .demo-rich .tour-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.bearlymail-landing .demo-rich .tour-skip { background: none; border: none; font-size: 12.5px; color: var(--ink-3); cursor: pointer; padding: 6px 2px; }
.bearlymail-landing .demo-rich .tour-skip:hover { color: var(--ink); }
.bearlymail-landing .demo-rich .tour-next {
  font-size: 12.5px; font-weight: 700; color: var(--ink); background: var(--sun); border: none;
  border-radius: 9px; padding: 8px 15px; cursor: pointer; transition: filter .12s;
}
.bearlymail-landing .demo-rich .tour-next:hover { filter: brightness(.96); }
@media (prefers-reduced-motion: reduce) {
  .bearlymail-landing .demo-rich .tour-spot, .bearlymail-landing .demo-rich .tour-pop { transition: none; }
  .bearlymail-landing .demo-rich .tour-spot::after { animation: none; }
}
`;
