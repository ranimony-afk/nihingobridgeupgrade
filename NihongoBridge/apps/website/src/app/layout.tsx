import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CookieConsent } from "@/shared/components/CookieConsent";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nihongo Bridge — Master Japanese, JLPT & Careers in Japan",
  description:
    "Learn Japanese from zero to JLPT N1 with vocabulary, kanji, grammar, reading, listening, conversation practice, mock exams, and Japan career guidance. Fully CMS-driven next-generation learning platform.",
  verification: {
    google: "google-site-verification-code-value-12345",
  },
  other: {
    "google-adsense-account": "ca-pub-1234567890123456",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google Analytics Global Site Tag */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-123456789"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-123456789');
            `,
          }}
        />

        {/* Microsoft Clarity Tracking Code */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "clarity-id-12345");
            `,
          }}
        />
      </head>
      <body className="bg-slate-100 text-slate-900 antialiased">
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
