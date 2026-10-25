/**
 * Metadata for the template and launcher-icon galleries. The ids here must stay in sync with the widget's real
 * rendering (packages/widget/src/styles.ts for templates, src/widget.ts's ICONS for launcher icons) - this file
 * only describes them for the gallery UI; it does not implement them. There are 3 templates and 6 icons: a
 * deliberately small first slice (see docs/dashboard.md), not the full set a mature product would eventually have.
 */
import type { LauncherIcon, WidgetTemplate } from "@matrix-eye/sdk";

export interface TemplateInfo {
  id: WidgetTemplate;
  name: string;
  description: string;
  useCase: string;
  tags: string[];
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: "minimal",
    name: "Matrix Minimal",
    description: "A compact floating panel with restrained borders and shadows. The recommended default for general-purpose websites.",
    useCase: "General websites, personal brands, small businesses",
    tags: ["Compact", "Default", "Light & dark"],
  },
  {
    id: "saas",
    name: "Modern SaaS",
    description: "A structured header, slightly larger geometry and medium corner radius, for product and developer-tool sites.",
    useCase: "SaaS products, developer tools, startups",
    tags: ["Structured header", "Rounded", "Light & dark"],
  },
  {
    id: "developer",
    name: "Developer Console",
    description: "Compact and technical: monospace type for the header, citations and input, tighter spacing, sharper corners.",
    useCase: "API docs, SDKs, developer portals",
    tags: ["Monospace accents", "Dense", "Light & dark"],
  },
];

export interface LauncherIconInfo {
  id: LauncherIcon;
  name: string;
  family: "Conversation" | "AI & assistant" | "Support" | "Knowledge" | "Minimal";
}

export const LAUNCHER_ICONS: LauncherIconInfo[] = [
  { id: "chat", name: "Chat bubble", family: "Conversation" },
  { id: "sparkle", name: "Sparkle", family: "AI & assistant" },
  { id: "headset", name: "Headset", family: "Support" },
  { id: "help", name: "Help circle", family: "Support" },
  { id: "book", name: "Book", family: "Knowledge" },
  { id: "dot", name: "Minimal dot", family: "Minimal" },
];
