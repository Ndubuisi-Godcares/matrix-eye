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
    a: "<p>It reads your website, builds a searchable index of your pages, and runs a chat window that answers visitors' questions from that content. Every answer links to the pages it came from.</p>",
  },
  {
    q: "Will it make things up?",
    a: "<p>It is built not to. Answers are written only from passages found on your site, every factual answer cites its source, and prices, dates and contact details are checked against the page text before they are shown. When your site does not cover a question, it says so instead of guessing.</p><p>No system is perfect, so every answer has thumbs up and down buttons: they show you exactly where the assistant needs help. See <a href=\"/docs/accuracy/\">how we measure accuracy</a>.</p>",
  },
  {
    q: "Do I need to write FAQs or train a model?",
    a: "<p>No. It learns from your pages. For the few things that must always be answered one exact way, such as a refund policy, you can add a fixed rule that overrides everything else.</p>",
  },
  {
    q: "Can I run it on my own server?",
    a: "<p>Yes. The core is designed for self-hosting and works with a language model running on your own machine, so visitors' questions never leave your infrastructure. A hosted service is planned for people who prefer not to run anything. See <a href=\"/docs/self-hosting/\">self-hosting</a>.</p>",
  },
  {
    q: "Does it work with React or other JavaScript websites?",
    a: "<p>Yes. Sites that draw their content with JavaScript are read with a built-in browser mode, so single-page apps can be indexed too.</p>",
  },
  {
    q: "Which websites can it read?",
    a: "<p>Only sites its user owns or has permission to index. It follows <code>robots.txt</code>, identifies itself as <a href=\"/bot/\">MatrixEyeBot</a>, and crawls gently. Private pages behind a login are not read.</p>",
  },
  {
    q: "Which languages does it support?",
    a: "<p>English works best today. The chat window can be translated, and answers follow the language the visitor uses when the model supports it, but accuracy has been measured in English only.</p>",
  },
  {
    q: "Is the chat window accessible?",
    a: "<p>It is built for keyboards and screen readers, meets WCAG 2.1 AA colour contrast, and is checked with automated accessibility tests on every change. Automated tests catch only part of the problems, so testing with real screen readers is planned before launch.</p>",
  },
  {
    q: "What does it cost?",
    a: "<p>Early access is free while we learn from real use. Planned plans are on the <a href=\"/pricing/\">pricing page</a>. Prices there are estimates, and no payment is taken today.</p>",
  },
];
