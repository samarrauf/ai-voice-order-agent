// =====================================================================
// Food illustrations
// ---------------------------------------------------------------------
// 18 original drawings (three per menu group) made of plain SVG shapes
// in the brand colours. They are stand-ins for real dish photos in the
// home page carousel: when a photo is supplied for a slide (see
// data/sites/olive-n-spice/hero.ts) the photo is shown instead.
// Nothing here is copied or downloaded; every shape is written by hand.
// =====================================================================

import type { HeroArt } from "@/data/sites/olive-n-spice/hero";

const C = {
  line: "#2f3d22",
  olive: "#556b3f",
  oliveLight: "#6f8752",
  sage: "#8fa377",
  sageLight: "#c9d4b5",
  mint: "#a9c08a",
  gold: "#c9a227",
  goldLight: "#ecd98b",
  goldDeep: "#a9851a",
  bake: "#d9a93c", // buns, bread, fried coating
  brown: "#8a6420", // grilled meat
  cocoa: "#5e4420", // chocolate
  cream: "#fdf9ee",
  creamDeep: "#efe4c8",
  red: "#d64545",
};

/** Shared outline style for every drawing. */
const S = {
  stroke: C.line,
  strokeWidth: 3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const NO = { stroke: "none" } as const;

function Fries() {
  return (
    <g {...S}>
      <rect x="60" y="48" width="15" height="84" rx="4" fill={C.gold} transform="rotate(-16 67 130)" />
      <rect x="78" y="32" width="15" height="100" rx="4" fill={C.goldLight} transform="rotate(-7 85 130)" />
      <rect x="93" y="24" width="15" height="108" rx="4" fill={C.gold} />
      <rect x="109" y="34" width="15" height="98" rx="4" fill={C.goldLight} transform="rotate(8 116 130)" />
      <rect x="126" y="50" width="15" height="82" rx="4" fill={C.gold} transform="rotate(17 133 130)" />
      <rect x="68" y="62" width="14" height="70" rx="4" fill={C.goldLight} transform="rotate(-11 75 130)" />
      <rect x="100" y="54" width="14" height="78" rx="4" fill={C.goldLight} transform="rotate(3 107 130)" />
      <rect x="118" y="66" width="14" height="66" rx="4" fill={C.gold} transform="rotate(12 125 130)" />
      <path d="M50 110h100l-13 70c-1 5-5 8-10 8H73c-5 0-9-3-10-8Z" fill={C.olive} />
      <path d="M54.2 132h91.6l-3.4 18H57.6Z" fill={C.cream} {...NO} />
      <path d="M54.2 132h91.6M57.6 150h84.8" stroke={C.gold} strokeWidth="2" />
      <path d="M100 134.5c5.5 3.2 5.5 9.8 0 13-5.5-3.2-5.5-9.8 0-13Z" fill={C.olive} {...NO} />
    </g>
  );
}

function Soup() {
  return (
    <g {...S}>
      <path d="M78 60c-8-9 8-17 0-27M100 52c-8-9 8-17 0-27M122 60c-8-9 8-17 0-27" fill="none" stroke={C.sage} />
      <ellipse cx="100" cy="172" rx="70" ry="10" fill={C.creamDeep} />
      <path d="M32 96c0 44 28 70 68 70s68-26 68-70Z" fill={C.cream} />
      <path d="M41 122c18 12 100 12 118 0" fill="none" stroke={C.olive} />
      <path d="M50 136c20 9 80 9 100 0" fill="none" stroke={C.gold} strokeWidth="2" />
      <path d="M150 88l30-26" stroke={C.line} strokeWidth="9" />
      <path d="M150 88l30-26" stroke={C.sageLight} strokeWidth="4" />
      <ellipse cx="100" cy="96" rx="68" ry="15" fill={C.creamDeep} />
      <ellipse cx="100" cy="97" rx="57" ry="10" fill={C.gold} stroke={C.goldDeep} strokeWidth="2" />
      <circle cx="82" cy="96" r="3.5" fill={C.red} {...NO} />
      <circle cx="120" cy="99" r="3" fill={C.red} {...NO} />
      <path d="M96 94c5-4 12-2 13 2-5 3-11 2-13-2Z" fill={C.olive} {...NO} />
    </g>
  );
}

function Drumstick({ transform, fill }: { transform: string; fill: string }) {
  return (
    <g transform={transform}>
      <rect x="-7" y="34" width="14" height="38" fill={C.cream} />
      <circle cx="-8" cy="76" r="9" fill={C.cream} />
      <circle cx="8" cy="76" r="9" fill={C.cream} />
      <path d="M-5.5 60h11v16h-11Z" fill={C.cream} {...NO} />
      <path d="M0-62c26 0 42 22 40 46-2 22-18 34-30 42v14h-20v-14c-12-8-28-20-30-42-2-24 14-46 40-46Z" fill={fill} />
      <path d="M-18-32c6-6 14-6 20 0M2-10c6-6 14-6 20 0M-22-4c5-5 11-5 16 0M-6-48c5-4 10-4 15 0" fill="none" stroke={C.goldDeep} strokeWidth="2.5" />
    </g>
  );
}

function Wings() {
  return (
    <g {...S}>
      <Drumstick transform="translate(74 100) rotate(-30) scale(0.9)" fill="#c8962f" />
      <Drumstick transform="translate(124 96) rotate(26)" fill={C.bake} />
      <path d="M92 176c4-8 12-8 16 0-4 6-12 6-16 0Z" fill={C.sage} strokeWidth="2" />
    </g>
  );
}

function Pasta() {
  return (
    <g {...S}>
      <ellipse cx="100" cy="132" rx="86" ry="36" fill={C.cream} />
      <ellipse cx="100" cy="130" rx="64" ry="25" fill={C.creamDeep} strokeWidth="2" />
      <g transform="rotate(30 150 70)">
        <rect x="147" y="10" width="7" height="66" rx="3.5" fill={C.sageLight} />
        <path d="M138 72h25v22c0 9-5.5 13-12.5 13S138 103 138 94Z" fill={C.sageLight} />
        <path d="M146.5 74v16M154.5 74v16" strokeWidth="2.5" />
      </g>
      <path d="M50 124c0-34 24-54 50-54s50 20 50 54c0 14-24 24-50 24s-50-10-50-24Z" fill={C.goldLight} />
      <path
        d="M60 120c10-22 34-34 58-28M70 134c14-20 42-28 68-20M82 80c16 12 38 16 58 28M62 104c18 16 46 22 74 20M92 142c12-12 30-16 50-14"
        fill="none"
        stroke={C.goldDeep}
        strokeWidth="2.5"
      />
      <circle cx="80" cy="106" r="5.5" fill={C.red} strokeWidth="2" />
      <circle cx="124" cy="120" r="5" fill={C.red} strokeWidth="2" />
      <path d="M100 82c-12-9-12-24 0-32 12 8 12 23 0 32Z" fill={C.sage} strokeWidth="2.5" transform="rotate(-24 100 82)" />
      <path d="M100 82c-10-8-10-21 0-28 10 7 10 20 0 28Z" fill={C.oliveLight} strokeWidth="2.5" transform="rotate(26 100 82)" />
    </g>
  );
}

function Steak() {
  return (
    <g {...S}>
      <ellipse cx="100" cy="118" rx="90" ry="50" fill={C.cream} />
      <ellipse cx="100" cy="116" rx="70" ry="37" fill={C.creamDeep} strokeWidth="2" />
      <path d="M46 114c2 18 20 28 48 30s56-8 58-28v8c-2 20-30 30-58 28s-46-12-48-30Z" fill="#6f5019" />
      <path d="M46 112c-2-20 22-32 52-30s56 10 54 32-30 30-58 28-46-10-48-30Z" fill="#b8862b" />
      <path d="M70 96l18 32M90 90l22 40M112 92l18 34" fill="none" strokeWidth="4" opacity="0.5" />
      <path d="M62 78c18 4 44 16 62 34" fill="none" stroke={C.olive} strokeWidth="2.5" />
      <path d="M72 80l-2-9M82 85l1-10M92 90l3-9M102 96l4-9M112 103l5-8M74 82l-7 6M86 88l-6 8M98 95l-5 8" fill="none" stroke={C.olive} strokeWidth="2.5" />
      <circle cx="152" cy="140" r="9" fill={C.red} strokeWidth="2.5" />
      <circle cx="166" cy="124" r="7.5" fill={C.red} strokeWidth="2.5" />
      <path d="M148 136c1-2 3-3 5-3" fill="none" stroke={C.cream} strokeWidth="2" />
      <rect x="28" y="130" width="34" height="9" rx="4.5" fill={C.sage} strokeWidth="2.5" transform="rotate(24 45 134)" />
      <rect x="36" y="142" width="34" height="9" rx="4.5" fill={C.oliveLight} strokeWidth="2.5" transform="rotate(10 53 146)" />
    </g>
  );
}

function Cloche() {
  return (
    <g {...S}>
      <ellipse cx="100" cy="158" rx="88" ry="12" fill={C.creamDeep} />
      <path d="M30 148c0-52 30-86 70-86s70 34 70 86Z" fill={C.cream} />
      <path d="M50 132c2-26 16-46 38-54" fill="none" stroke={C.sageLight} strokeWidth="7" />
      <rect x="22" y="146" width="156" height="12" rx="6" fill={C.gold} />
      <rect x="95" y="56" width="10" height="8" fill={C.gold} />
      <circle cx="100" cy="48" r="10" fill={C.gold} />
      <path d="M162 40l3 9 9 3-9 3-3 9-3-9-9-3 9-3ZM38 46l2 6 6 2-6 2-2 6-2-6-6-2 6-2ZM180 86l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill={C.gold} {...NO} />
    </g>
  );
}

function Wok() {
  return (
    <g {...S}>
      <path d="M58 92c10-44 74-44 84 0" fill="none" stroke={C.gold} strokeWidth="2" strokeDasharray="1 8" />
      <path d="M62 62c-6 2-9 10-4 15 7-1 10-9 4-15Z" fill={C.red} strokeWidth="2.5" />
      <rect x="92" y="38" width="16" height="16" rx="3" fill={C.sage} strokeWidth="2.5" transform="rotate(22 100 46)" />
      <path d="M128 56c8-2 14 4 13 11-7 2-13-3-13-11Z" fill={C.goldLight} strokeWidth="2.5" />
      <rect x="78" y="70" width="15" height="15" rx="3" fill={C.bake} strokeWidth="2.5" transform="rotate(-14 85 77)" />
      <rect x="110" y="76" width="14" height="14" rx="3" fill={C.bake} strokeWidth="2.5" transform="rotate(18 117 83)" />
      <path d="M146 40c8 2 10 10 5 16-8-2-10-10-5-16Z" fill={C.oliveLight} strokeWidth="2.5" />
      <path d="M164 112l30-17 5 9-31 19Z" fill={C.goldDeep} />
      <path d="M37 114c-12-1-18 6-15 14" fill="none" stroke={C.oliveLight} strokeWidth="5" />
      <path d="M33 108h134c-5 40-34 62-67 62s-62-22-67-62Z" fill={C.oliveLight} />
      <path d="M52 142c12 14 30 20 48 20" fill="none" stroke={C.sageLight} strokeWidth="2.5" />
      <ellipse cx="100" cy="108" rx="67" ry="10" fill={C.sage} />
      <ellipse cx="100" cy="108.5" rx="56" ry="6" fill={C.goldLight} strokeWidth="2" />
      <circle cx="84" cy="108" r="3" fill={C.red} {...NO} />
      <circle cx="112" cy="109" r="3" fill={C.sage} {...NO} />
    </g>
  );
}

function RiceBowl() {
  return (
    <g {...S}>
      <path d="M152 22l-50 80" stroke={C.line} strokeWidth="9" />
      <path d="M152 22l-50 80" stroke={C.gold} strokeWidth="4" />
      <path d="M170 32l-54 74" stroke={C.line} strokeWidth="9" />
      <path d="M170 32l-54 74" stroke={C.gold} strokeWidth="4" />
      <path d="M42 102c2-30 28-48 58-48s56 18 58 48Z" fill="#fffdf6" />
      <path d="M66 84l6-3M84 70l6-2M106 66l6 2M126 78l6 3M96 88l6-2M116 92l6 1M76 96l6-2M138 94l5 2M92 76l5 3" fill="none" stroke={C.sage} strokeWidth="2.5" />
      <circle cx="78" cy="76" r="4" fill={C.sage} strokeWidth="2" />
      <circle cx="122" cy="72" r="4" fill={C.gold} strokeWidth="2" />
      <circle cx="102" cy="80" r="4" fill={C.red} strokeWidth="2" />
      <path d="M30 100h140c-2 40-30 66-70 66s-68-26-70-66Z" fill={C.cream} />
      <path d="M37 120c20 11 106 11 126 0" fill="none" stroke={C.gold} strokeWidth="4" />
      <path d="M44 133c20 9 92 9 112 0" fill="none" stroke={C.olive} strokeWidth="2" />
      <path d="M76 166h48l5 11H71Z" fill={C.sage} />
    </g>
  );
}

function NoodleBox() {
  return (
    <g {...S}>
      <path d="M122 16l-16 70" stroke={C.line} strokeWidth="9" />
      <path d="M122 16l-16 70" stroke={C.gold} strokeWidth="4" />
      <path d="M142 22l-22 66" stroke={C.line} strokeWidth="9" />
      <path d="M142 22l-22 66" stroke={C.gold} strokeWidth="4" />
      <path d="M54 82c2-20 24-28 46-22 22-8 44 2 46 22Z" fill={C.goldLight} />
      <path d="M62 74q8-10 16 0t16 0 16 0 16 0 12 0M70 64q8-9 16 0t16 0 16 0 12-2" fill="none" stroke={C.goldDeep} strokeWidth="2.5" />
      <circle cx="74" cy="72" r="4" fill={C.sage} strokeWidth="2" />
      <circle cx="132" cy="70" r="4" fill={C.red} strokeWidth="2" />
      <path d="M48 80h104l-13 98H61Z" fill={C.cream} />
      <path d="M48 80h104l-19 24H67Z" fill={C.creamDeep} />
      <circle cx="100" cy="140" r="21" fill="none" stroke={C.olive} strokeWidth="2.5" />
      <path d="M100 126c8 5 8 23 0 28-8-5-8-23 0-28Z" fill={C.olive} {...NO} />
      <path d="M100 128v26" stroke={C.cream} strokeWidth="1.5" />
    </g>
  );
}

function Pizza() {
  return (
    <g {...S}>
      <circle cx="100" cy="100" r="84" fill={C.bake} />
      <circle cx="100" cy="100" r="69" fill={C.goldLight} stroke={C.goldDeep} strokeWidth="2" />
      <path d="M100 31v138M31 100h138M51.2 51.2l97.6 97.6M148.8 51.2l-97.6 97.6" stroke={C.goldDeep} strokeWidth="1.5" opacity="0.6" />
      <g strokeWidth="2.5">
        <circle cx="76" cy="68" r="10" fill={C.red} />
        <circle cx="132" cy="78" r="10" fill={C.red} />
        <circle cx="94" cy="134" r="10" fill={C.red} />
        <circle cx="138" cy="126" r="9" fill={C.red} />
        <circle cx="62" cy="108" r="9" fill={C.red} />
      </g>
      <g strokeWidth="2.5">
        <circle cx="106" cy="62" r="6.5" fill={C.olive} />
        <circle cx="118" cy="106" r="6.5" fill={C.olive} />
        <circle cx="72" cy="138" r="6.5" fill={C.olive} />
        <circle cx="152" cy="100" r="6.5" fill={C.olive} />
        <circle cx="86" cy="96" r="6.5" fill={C.olive} />
      </g>
      <g fill={C.goldLight} {...NO}>
        <circle cx="106" cy="62" r="2.4" />
        <circle cx="118" cy="106" r="2.4" />
        <circle cx="72" cy="138" r="2.4" />
        <circle cx="152" cy="100" r="2.4" />
        <circle cx="86" cy="96" r="2.4" />
      </g>
      <path d="M56 78c6-6 14-6 18 0M112 142c6-6 14-6 18 0M124 48c5-5 12-5 16 0" fill="none" stroke={C.sage} strokeWidth="4.5" />
      <path d="M100 100c-9-6-9-17 0-22 9 5 9 16 0 22Z" fill={C.sage} strokeWidth="2.5" transform="rotate(40 100 100)" />
      <path d="M100 100c-8-6-8-16 0-21 8 5 8 15 0 21Z" fill={C.oliveLight} strokeWidth="2.5" transform="rotate(-50 100 100)" />
    </g>
  );
}

function Burger() {
  return (
    <g {...S}>
      <path d="M100 38V14" stroke={C.goldDeep} />
      <circle cx="100" cy="16" r="8" fill={C.olive} />
      <circle cx="100" cy="16" r="2.6" fill={C.red} {...NO} />
      <path d="M38 150h124v8c0 12-10 18-24 18H62c-14 0-24-6-24-18Z" fill={C.bake} />
      <rect x="32" y="126" width="136" height="24" rx="12" fill="#7a5a22" />
      <path d="M34 122h132l-24 16-20-13-24 16-22-15-20 10Z" fill={C.goldLight} />
      <rect x="36" y="108" width="128" height="14" rx="7" fill={C.red} />
      <path d="M28 104q9 13 18 0t18 0 18 0 18 0 18 0 18 0 18 0 18 0V96H28Z" fill={C.sage} />
      <path d="M34 96c0-38 30-58 66-58s66 20 66 58Z" fill={C.bake} />
      <g fill={C.cream} strokeWidth="1.5">
        <ellipse cx="72" cy="62" rx="5" ry="2.6" transform="rotate(-24 72 62)" />
        <ellipse cx="100" cy="52" rx="5" ry="2.6" />
        <ellipse cx="128" cy="62" rx="5" ry="2.6" transform="rotate(24 128 62)" />
        <ellipse cx="86" cy="78" rx="5" ry="2.6" transform="rotate(-10 86 78)" />
        <ellipse cx="116" cy="78" rx="5" ry="2.6" transform="rotate(10 116 78)" />
        <ellipse cx="56" cy="82" rx="5" ry="2.6" transform="rotate(-30 56 82)" />
        <ellipse cx="144" cy="82" rx="5" ry="2.6" transform="rotate(30 144 82)" />
      </g>
    </g>
  );
}

function Wrap() {
  return (
    <g {...S} transform="rotate(16 100 100)">
      <path d="M66 52q5-16 14-4 6-18 16-4 8-16 16 0 10-10 16 8Z" fill={C.sage} />
      <circle cx="84" cy="50" r="8" fill={C.red} strokeWidth="2.5" />
      <rect x="98" y="36" width="18" height="18" rx="4" fill={C.bake} strokeWidth="2.5" transform="rotate(14 107 45)" />
      <circle cx="122" cy="52" r="6" fill={C.goldLight} strokeWidth="2.5" />
      <path d="M62 58c0-10 76-10 76 0l-8 112c0 10-60 10-60 0Z" fill="#f3e3b8" />
      <path d="M62 58c0 9 76 9 76 0" fill="none" />
      <path d="M78 78l8 10M100 74l8 10M120 80l6 8M88 96l8 10M112 96l8 10" fill="none" stroke={C.goldDeep} strokeWidth="2.5" opacity="0.7" />
      <path d="M66.4 116h67.2l-3.6 54c0 10-60 10-60 0Z" fill={C.olive} />
      <path d="M72 128l56 20M70 146l58 20M74 116l56 16" fill="none" stroke={C.gold} strokeWidth="2" />
    </g>
  );
}

function Handi() {
  return (
    <g {...S}>
      <path d="M80 42c-7-8 7-14 0-22M100 36c-7-8 7-14 0-22M120 42c-7-8 7-14 0-22" fill="none" stroke={C.sage} />
      <ellipse cx="100" cy="176" rx="44" ry="6" fill={C.goldDeep} />
      <circle cx="34" cy="116" r="10" fill="none" stroke={C.goldDeep} strokeWidth="5" />
      <circle cx="166" cy="116" r="10" fill="none" stroke={C.goldDeep} strokeWidth="5" />
      <path d="M52 98c-24 24-18 70 22 76h52c40-6 46-52 22-76Z" fill={C.gold} />
      <path d="M40 130c22 14 98 14 120 0" fill="none" strokeWidth="2.5" />
      <path d="M44 144c22 12 90 12 112 0" fill="none" strokeWidth="2.5" />
      <path d="M62 141l6-5 6 5-6 5ZM94 147l6-5 6 5-6 5ZM126 141l6-5 6 5-6 5Z" fill={C.cream} strokeWidth="1.5" />
      <path d="M66 118c8 3 16 4 24 4" fill="none" stroke={C.goldLight} strokeWidth="4" />
      <rect x="42" y="84" width="116" height="14" rx="7" fill={C.goldLight} />
      <path d="M56 84c2-22 86-22 88 0Z" fill={C.gold} />
      <circle cx="100" cy="60" r="8" fill={C.goldLight} />
    </g>
  );
}

function Skewer({ transform }: { transform: string }) {
  return (
    <g transform={transform}>
      <path d="M12 100h176" stroke={C.line} strokeWidth="7" />
      <path d="M12 100h176" stroke={C.sageLight} strokeWidth="3" />
      <circle cx="16" cy="100" r="7" fill="none" stroke={C.sageLight} strokeWidth="4" />
      <rect x="44" y="84" width="28" height="32" rx="9" fill="#a8752a" />
      <rect x="76" y="86" width="18" height="28" rx="6" fill={C.sage} />
      <rect x="98" y="84" width="28" height="32" rx="9" fill="#b8862b" />
      <rect x="130" y="86" width="18" height="28" rx="6" fill={C.red} />
      <rect x="152" y="85" width="24" height="30" rx="9" fill="#a8752a" />
      <path d="M52 92l8 14M106 92l8 14M158 93l7 13" fill="none" strokeWidth="2.5" opacity="0.55" />
    </g>
  );
}

function Skewers() {
  return (
    <g {...S}>
      <Skewer transform="rotate(34 100 100)" />
      <Skewer transform="rotate(-30 100 100)" />
      <path d="M86 170a16 16 0 0 1 32 0Z" fill={C.goldLight} strokeWidth="2.5" />
      <path d="M102 170v-14M102 170l-9-10M102 170l9-10" fill="none" stroke={C.goldDeep} strokeWidth="1.5" />
    </g>
  );
}

function Naan() {
  return (
    <g {...S}>
      <path d="M78 22c30 2 52 34 50 70-2 22-66 26-72 4-8-32 0-70 22-74Z" fill="#e9c877" transform="rotate(-18 92 70)" />
      <path d="M124 26c30 6 46 40 40 74-4 22-66 20-70-2-6-32 6-68 30-72Z" fill="#f0d68f" transform="rotate(14 128 70)" />
      <g fill="#b8862b" {...NO} opacity="0.75">
        <ellipse cx="72" cy="56" rx="7" ry="4.5" transform="rotate(-30 72 56)" />
        <ellipse cx="92" cy="76" rx="6" ry="4" />
        <ellipse cx="128" cy="52" rx="7" ry="4.5" transform="rotate(20 128 52)" />
        <ellipse cx="144" cy="80" rx="6" ry="4" transform="rotate(-20 144 80)" />
        <ellipse cx="112" cy="66" rx="5" ry="3.5" />
      </g>
      <g fill={C.line} {...NO}>
        <circle cx="82" cy="42" r="1.6" />
        <circle cx="62" cy="72" r="1.6" />
        <circle cx="136" cy="66" r="1.6" />
        <circle cx="120" cy="84" r="1.6" />
        <circle cx="150" cy="62" r="1.6" />
        <circle cx="100" cy="54" r="1.6" />
      </g>
      <path d="M30 110h140l-15 60c-2 6-6 8-12 8H57c-6 0-10-2-12-8Z" fill="#c99a3a" />
      <path d="M36 128h128M40 146h120M46 164h108" fill="none" strokeWidth="2" opacity="0.5" />
      <path d="M62 112v64M88 112v66M114 112v66M140 112v64" fill="none" strokeWidth="2" opacity="0.35" />
      <path d="M26 104h60l-22 40Z" fill={C.cream} />
      <path d="M40 104l22 30M54 104l14 20" fill="none" stroke={C.sage} strokeWidth="2" />
      <rect x="24" y="100" width="152" height="13" rx="6.5" fill={C.gold} />
    </g>
  );
}

function LavaCake() {
  return (
    <g {...S}>
      <ellipse cx="100" cy="162" rx="84" ry="17" fill={C.cream} />
      <ellipse cx="100" cy="160" rx="62" ry="11" fill={C.creamDeep} strokeWidth="2" />
      <path d="M36 164c14 8 34 4 44-4" fill="none" stroke={C.gold} strokeWidth="3" />
      <path d="M58 156l6-52c0-9 72-9 72 0l6 52c0 11-84 11-84 0Z" fill="#6b4e22" />
      <ellipse cx="100" cy="104" rx="36" ry="8.5" fill="#7f5d2a" />
      <path d="M84 106c0 16 8 16 8 30 0 9 11 9 11-1 0-10 8-8 10-29Z" fill="#3b2a10" strokeWidth="2.5" />
      <path d="M72 96c-2-24 12-40 28-40s30 16 28 40c-8 8-48 8-56 0Z" fill="#fffaea" />
      <path d="M72 96q7 9 14 0t14 0 14 0 14 0" fill="none" strokeWidth="2.5" />
      <path d="M84 72c3-7 9-10 15-10" fill="none" stroke={C.creamDeep} strokeWidth="4" />
      <path d="M118 56c-2-12 8-20 18-18 0 10-8 18-18 18Z" fill={C.sage} strokeWidth="2.5" />
      <path d="M116 56c-10-4-12-16-6-22 8 4 12 14 6 22Z" fill={C.oliveLight} strokeWidth="2.5" />
      <path d="M166 62l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5Z" fill={C.gold} {...NO} />
    </g>
  );
}

function MintDrink() {
  return (
    <g {...S}>
      <path d="M126 12l-20 96" stroke={C.line} strokeWidth="10" />
      <path d="M126 12l-20 96" stroke={C.gold} strokeWidth="5" />
      <path d="M60 52h80l-10 122c-1 6-5 8-10 8H80c-5 0-9-2-10-8Z" fill="#f1f5e6" />
      <path d="M62.2 78h75.6l-8 96c-1 5-4.6 7-9.4 7H79.6c-4.800 0-8.400-2-9.400-7Z" fill={C.mint} {...NO} />
      <rect x="76" y="92" width="20" height="20" rx="4" fill="#f1f5e6" strokeWidth="2" opacity="0.8" transform="rotate(-12 86 102)" />
      <rect x="104" y="116" width="20" height="20" rx="4" fill="#f1f5e6" strokeWidth="2" opacity="0.8" transform="rotate(16 114 126)" />
      <rect x="80" y="142" width="18" height="18" rx="4" fill="#f1f5e6" strokeWidth="2" opacity="0.8" transform="rotate(8 89 151)" />
      <path d="M112 96c6-5 13-3 14 3-5 4-12 3-14-3ZM78 128c5-5 12-4 13 2-5 4-11 3-13-2ZM108 156c5-4 11-3 12 2-5 4-10 3-12-2Z" fill={C.olive} {...NO} />
      <path d="M60 52h80l-10 122c-1 6-5 8-10 8H80c-5 0-9-2-10-8Z" fill="none" />
      <circle cx="60" cy="54" r="21" fill="#dfe9b0" />
      <circle cx="60" cy="54" r="14.5" fill="#f0f5d2" strokeWidth="1.5" />
      <path d="M60 39.500v29M45.500 54h29M49.700 43.700l20.600 20.600M70.300 43.700L49.700 64.300" strokeWidth="1.5" opacity="0.6" />
      <path d="M134 44c-2-14 8-24 20-22 0 12-8 22-20 22Z" fill={C.sage} strokeWidth="2.5" />
      <path d="M132 44c-12-4-16-18-8-26 10 4 14 16 8 26Z" fill={C.oliveLight} strokeWidth="2.5" />
    </g>
  );
}

function LimeDrink() {
  return (
    <g {...S}>
      <path d="M76 20l22 96" stroke={C.line} strokeWidth="10" />
      <path d="M76 20l22 96" stroke={C.olive} strokeWidth="5" />
      <path d="M48 74h104l-9 96c-1 8-6 12-13 12H70c-7 0-12-4-13-12Z" fill="#f6f8ec" />
      <path d="M50.200 96h99.600l-7 74c-1 7-5.400 10.500-11.800 10.500H69c-6.400 0-10.800-3.500-11.800-10.500Z" fill="#ead98a" {...NO} />
      <circle cx="82" cy="140" r="19" fill="#dfe9b0" strokeWidth="2" />
      <circle cx="82" cy="140" r="13" fill="#f0f5d2" strokeWidth="1.5" />
      <path d="M82 127v26M69 140h26M72.800 130.800l18.400 18.400M91.200 130.800l-18.400 18.400" strokeWidth="1.5" opacity="0.6" />
      <rect x="108" y="108" width="22" height="22" rx="4" fill="#f6f8ec" strokeWidth="2" opacity="0.85" transform="rotate(14 119 119)" />
      <rect x="112" y="144" width="20" height="20" rx="4" fill="#f6f8ec" strokeWidth="2" opacity="0.85" transform="rotate(-10 122 154)" />
      <circle cx="100" cy="112" r="3" fill="#f6f8ec" {...NO} />
      <circle cx="140" cy="136" r="2.5" fill="#f6f8ec" {...NO} />
      <circle cx="64" cy="112" r="2.5" fill="#f6f8ec" {...NO} />
      <path d="M48 74h104l-9 96c-1 8-6 12-13 12H70c-7 0-12-4-13-12Z" fill="none" />
      <path d="M128 76a24 24 0 0 1 48 0Z" fill="#dfe9b0" transform="rotate(-28 152 76)" />
      <path d="M134 76a18 18 0 0 1 36 0Z" fill="#f0f5d2" strokeWidth="1.5" transform="rotate(-28 152 76)" />
    </g>
  );
}

const ART = {
  fries: Fries,
  soup: Soup,
  wings: Wings,
  pasta: Pasta,
  steak: Steak,
  cloche: Cloche,
  wok: Wok,
  "rice-bowl": RiceBowl,
  "noodle-box": NoodleBox,
  pizza: Pizza,
  burger: Burger,
  wrap: Wrap,
  handi: Handi,
  skewers: Skewers,
  naan: Naan,
  "lava-cake": LavaCake,
  "mint-drink": MintDrink,
  "lime-drink": LimeDrink,
} as const satisfies Record<HeroArt, () => React.JSX.Element>;

export type FoodArtName = keyof typeof ART;
export const foodArtNames = Object.keys(ART) as FoodArtName[];

/** One illustration. Decorative, so it is hidden from screen readers. */
export function FoodArt({ name, className }: { name: FoodArtName; className?: string }) {
  const Drawing = ART[name];
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true" focusable="false">
      <Drawing />
    </svg>
  );
}
