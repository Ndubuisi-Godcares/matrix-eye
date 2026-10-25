/**
 * Frequently asked questions. Every answer must be true of the product as it is today; anything not built yet is
 * said to be planned. The same list feeds the FAQ section and the FAQPage structured data (search engines show it).
 */
export interface FaqItem {
  q: string;
  /** HTML (trusted). */
  a: string;
}

export const FAQ: FaqItem[] = [
  {
    q: "What does MatrixEye do?",
    a: "<p>It indexes your website content, retrieves the relevant passages for each question, and generates a response grounded in that content through a chat widget. Every answer includes a source reference linking to the page it came from.</p>",
  },
  {
    q: "Will it make things up?",
    a: "<p>It's designed not to. Responses are generated only from passages retrieved from your site, every factual claim includes a source reference, and prices, dates and contact details are validated against page content before being returned. When available context doesn't cover a question, the assistant abstains rather than guessing.</p><p>No system is perfect: every response includes feedback controls that surface exactly where the assistant needs improvement. See <a href=\"/docs/accuracy/\">how we measure accuracy</a>.</p>",
  },
  {
    q: "Do I need to write FAQs or train a model?",
    a: "<p>No. The assistant is grounded directly in your existing pages. For the few things that must always be answered one exact way, such as a refund policy, you can add a fixed rule that overrides everything else.</p>",
  },
  {
    q: "Can I run it on my own server?",
    a: "<p>Yes. The core is designed for self-hosting and works with a language model running on your own infrastructure, so visitor questions never leave your network. A hosted service is planned for teams that prefer not to operate the deployment. See <a href=\"/docs/self-hosting/\">self-hosting</a>.</p>",
  },
  {
    q: "Does it work with React or other JavaScript websites?",
    a: "<p>Yes. Sites that render their content client-side with JavaScript are indexed using a built-in browser-rendering mode, so single-page applications are fully covered.</p>",
  },
  {
    q: "Which websites can it index?",
    a: "<p>Only sites its user owns or has permission to index. It follows <code>robots.txt</code>, identifies itself as <a href=\"/bot/\">MatrixEyeBot</a>, and crawls conservatively. Pages behind a login are not indexed.</p>",
  },
  {
    q: "Which languages does it support?",
    a: "<p>English performs best today. The chat widget can be translated, and responses follow the visitor's language when the underlying model supports it, but accuracy has only been measured in English.</p>",
  },
  {
    q: "Is the chat widget accessible?",
    a: "<p>It is built for keyboard and screen-reader use, meets WCAG 2.1 AA colour contrast, and is checked with automated accessibility tests on every change. Automated tests catch only part of the problems, so testing with real screen readers is planned before launch.</p>",
  },
  {
    q: "What does it cost?",
    a: "<p>Early access is free while we validate the product with real usage. Planned pricing is on the <a href=\"/pricing/\">pricing page</a>. Figures there are estimates, and no payment is taken today.</p>",
  },
];
