// How script elements (lib/script.ts) are laid out in exported HTML: the
// renderer in ./html.ts gives every non-prose block the class `b-<type>`.
// Comic pages and panels are numbered with CSS counters, as in the editor.

export const scriptCss = `
p[class^="b-"] { text-indent: 0; margin: 0.9em 0 0; }
.b-scene-heading, .b-shot, .b-act-heading { text-transform: uppercase; font-weight: bold; margin-top: 1.6em; }
.b-act-heading { text-align: center; }
.b-character, .b-transition { text-transform: uppercase; }
p.b-character { margin: 1em 0 0 35%; }
p.b-dialogue { margin: 0 15% 0 18%; }
p.b-parenthetical { margin: 0 25% 0 27%; }
p.b-transition { text-align: right; }
body { counter-reset: comic-page; }
p.b-comic-page { counter-increment: comic-page; counter-reset: comic-panel; text-transform: uppercase; font-weight: bold; margin-top: 2em; }
p.b-comic-page::before { content: "Page " counter(comic-page) " "; }
p.b-comic-panel { counter-increment: comic-panel; margin-top: 1.2em; }
p.b-comic-panel::before { content: "Panel " counter(comic-panel) ". "; font-weight: bold; }
p.b-comic-caption::before { content: "CAPTION: "; }
p.b-sfx::before { content: "SFX: "; }
p.b-music-cue::before { content: "MUSIC: "; }
.b-comic-caption, .b-sfx, .b-music-cue { margin-left: 10%; }
.b-sfx, .b-music-cue { text-transform: uppercase; }
.b-dual { display: table; table-layout: fixed; width: 100%; margin-top: 1em; }
.b-dual-col { display: table-cell; width: 50%; vertical-align: top; padding-right: 2%; }
.b-dual-col p.b-character { margin: 0 0 0 25%; }
.b-dual-col p.b-dialogue { margin: 0; }
.b-dual-col p.b-parenthetical { margin: 0 12%; }
`;
