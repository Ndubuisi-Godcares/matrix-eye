/**
 * Pricing plans, edited in ONE place.
 *
 * These prices are hypotheses from the commercial plan, not validated figures, and no plan is sold yet. The page says
 * so plainly. Change a number here and every page that shows it (pricing page, home teaser, structured data) updates.
 * Before launch: test the prices with real customers (see docs/website.md).
 */
export interface Plan {
  id: string;
  name: string;
  /** Who it is for, one sentence. */
  audience: string;
  /** Shown big. */
  price: string;
  /** Small text next to the price. */
  per?: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
  /** Plain-language availability so nobody mistakes a planned plan for a live one. */
  status: string;
}

export const PLANS: Plan[] = [
  {
    id: "community",
    name: "Community",
    audience: "For trying Matrix Eye and for people who run everything themselves.",
    price: "Free",
    features: [
      "Self-host the engine, API and chat widget",
      "Works with a language model on your own machine",
      "Read your site, including JavaScript sites",
      "TypeScript SDK and React component",
      "Community support",
    ],
    cta: { label: "Join the waitlist", href: "/waitlist/" },
    status: "Early access",
  },
  {
    id: "developer",
    name: "Developer Pro",
    audience: "For freelancers and small agencies adding assistants to client sites.",
    price: "$19–$39",
    per: "per month, estimated",
    features: ["Several projects under one account", "Hosted model usage included", "Advanced settings and usage analytics", "Faster support"],
    cta: { label: "Join the waitlist", href: "/waitlist/" },
    featured: true,
    status: "Planned",
  },
  {
    id: "business",
    name: "Business Hosted",
    audience: "For production websites that want it managed for them.",
    price: "$49–$149",
    per: "per month, estimated",
    features: ["Higher usage allowances", "Automatic re-reading of your site", "Your own branding (no “Powered by”)", "Monitoring and answer-quality reports", "Production support"],
    cta: { label: "Join the waitlist", href: "/waitlist/" },
    status: "Planned",
  },
  {
    id: "enterprise",
    name: "Private",
    audience: "For organisations that need extra control over where data lives.",
    price: "Custom",
    features: ["Deployment on your own infrastructure", "Advanced access controls", "Help with set-up and integration", "Support commitments"],
    cta: { label: "Talk to us", href: "/contact/" },
    status: "Planned",
  },
];
