// One import point for the chart components: import { CapsuleBars, Donut, Gauge, Sparkline } from "@/components/charts".
// Inline SVG/CSS only, colours from the chart palette (--chart-1..8). Home (A3b) and Reports (B5) share them.
export { CapsuleBars, type CapsuleDatum } from "./capsule-bars";
export { Donut, type DonutSlice } from "./donut";
export { Gauge } from "./gauge";
export { Sparkline } from "./sparkline";
